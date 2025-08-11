import { AgentHandler } from "../types/agent/handler";
import { AgentEvents } from "../types/agent/events";
import { AgentEventPayload } from "../types/agent/payload";
import { AgentContext } from "../types/agent/context";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

const PROTO_PATH = path.join(process.cwd(), "protos", "agent.proto");
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDef) as any;
const AgentService = protoDescriptor.agent.AgentService;

const client = new AgentService(
  "localhost:50051",
  grpc.credentials.createInsecure()
);

const AGENT_ID = process.argv[2];

type EventConfig = {
  eventType: string;
  webhookListener: string;
};

const EVENT_CONFIGS: Record<string, EventConfig> = {
  queryCreated: { eventType: "QUERY_CREATED", webhookListener: "emitQueryCreated" },
  queryCompleted: { eventType: "QUERY_COMPLETED", webhookListener: "emitQueryCompleted" },
  queryFailed: { eventType: "QUERY_FAILED", webhookListener: "emitQueryFailed" },
  eventCreated: { eventType: "EVENT_CREATED", webhookListener: "emitEventCreated" },
};

export function initAgent(agent: AgentHandler) {
  console.log(`Agent ${AGENT_ID} starting`);

  async function sendMessageToServer(payload: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const message = {
        data: Buffer.from(JSON.stringify(payload || {}), "utf8"),
        timestamp: Date.now(),
      };

      client.SendResult(message, (err: any, res: any) => {
        if (err) {
          console.error("❌ Failed to send result:", err.message);
          reject(err);
        } else {
          console.log("✅ Result sent:", res);
          resolve();
        }
      });
    });
  }

  async function emit(
    context: AgentContext,
    eventKey: keyof typeof EVENT_CONFIGS,
    payload: AgentEventPayload
  ) {
    const config = EVENT_CONFIGS[eventKey];
    const completePayload = {
      ...payload,
      eventType: config.eventType,
      webhookListener: config.webhookListener,
      queryId: context.queryId,
      agentId: context.agentId,
      params: context.params,
    };

    await sendMessageToServer(completePayload);
    return completePayload;
  }

  let activeCall: grpc.ClientReadableStream<any> | null = null;
  let backoffMs = 1000;
  const MAX_BACKOFF = 30000;

  function waitForServerReady(timeout = 2000): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout;
      client.waitForReady(deadline, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  function startTaskStream() {
    if (activeCall) return;

    (async () => {
      try {
        await waitForServerReady(2000);
      } catch {
        scheduleReconnect();
        return;
      }

      console.log(`Connecting TaskStream as ${AGENT_ID}`);
      const call = client.TaskStream({ agentId: AGENT_ID });
      activeCall = call;
      backoffMs = 1000; // reset backoff

      call.on("data", (task: any) => {
        const context = JSON.parse(task.payload.toString("utf8"));
        console.log(`Received task:`, context);

        const event: AgentEvents = {
          emitQueryCreated: (payload) => emit(context, "queryCreated", payload),
          emitQueryCompleted: (payload) => emit(context, "queryCompleted", payload),
          emitQueryFailed: (payload) => emit(context, "queryFailed", payload),
          emitEventCreated: (payload) => emit(context, "eventCreated", payload),
        };

        try {
          agent(context, event);
        } catch (e) {
          event.emitQueryFailed({ data: e });
        }
      });

      const onDisconnected = (reason?: any) => {
        if (activeCall === call) activeCall = null;
        console.warn(`TaskStream disconnected: ${reason?.message || reason}`);
        scheduleReconnect();
      };

      call.on("error", onDisconnected);
      call.on("end", onDisconnected);
      call.on("close", onDisconnected);
    })();
  }

  function scheduleReconnect() {
    const jitter = Math.floor(Math.random() * 300);
    const wait = Math.min(MAX_BACKOFF, backoffMs) + jitter;
    console.log(`Reconnecting in ${wait}ms`);
    setTimeout(() => {
      backoffMs = Math.min(MAX_BACKOFF, backoffMs * 2);
      startTaskStream();
    }, wait);
  }

  startTaskStream();

  process.on("exit", () => console.log("Agent exiting"));
  process.on("unhandledRejection", (reason) => console.error("Unhandled:", reason));
  process.on("uncaughtException", (err) => console.error("Uncaught:", err));
}

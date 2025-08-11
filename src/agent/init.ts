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

// gRPC client to connect to NestJS
const client = new AgentService("localhost:50051", grpc.credentials.createInsecure());

// Unique agent ID
const AGENT_ID = process.argv[2];

type EventConfig = {
  eventType: string;
  webhookListener: string;
};

const EVENT_CONFIGS: Record<string, EventConfig> = {
  queryCreated: {
    eventType: "QUERY_CREATED",
    webhookListener: "emitQueryCreated",
  },
  queryCompleted: {
    eventType: "QUERY_COMPLETED",
    webhookListener: "emitQueryCompleted",
  },
  queryFailed: {
    eventType: "QUERY_FAILED",
    webhookListener: "emitQueryFailed",
  },
  eventCreated: {
    eventType: "EVENT_CREATED",
    webhookListener: "emitEventCreated",
  },
};

export function initAgent(agent: AgentHandler) {
  console.log(`Agent ${AGENT_ID} starting`);
  // ✅ Send result to gRPC server
  async function sendMessageToServer(payload: any): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("Attempting to send:", payload?.eventType);
      const message = {
        data: Buffer.from(JSON.stringify(payload || {}), 'utf8'),
        timestamp: Date.now(),
      };
      console.log(message, 'message')
      client.SendResult(message, (err: any, res: any) => {
        if (err) {
          console.error("❌ Failed to send result:", err);
          reject(err);
        } else {
          console.log("✅ Result sent successfully:", res);
          resolve();
        }
      }
      );
    });
  }

  // ✅ Keep your emit logic
  async function emit(
    context: AgentContext,
    eventKey: keyof typeof EVENT_CONFIGS,
    payload: AgentEventPayload
  ) {
    console.log('inside emit', context, eventKey, payload)
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

  // ✅ Start TaskStream to receive tasks from server
  function startTaskStream() {
    console.log(`[Agent] Connecting TaskStream as ${AGENT_ID}`);
    const call = client.TaskStream({ agentId: AGENT_ID });

    call.on("data", (task: any) => {
      console.log(`[Agent] Received task:`, task);
      let taskData = JSON.parse(task.payload.toString('utf8'));

      const context: AgentContext = {
        queryId: taskData.queryId ,
        agentId: task.agentId,
        params: taskData.params, // can be expanded if needed
        webhookGroups: taskData.webhookGroups ,
        agentName: "testing"
      };
      console.log('emiting now', context);
      const event: AgentEvents = {
        emitQueryCreated: (payload: AgentEventPayload) =>
          emit(context, "queryCreated", payload),
        emitQueryCompleted: (payload: AgentEventPayload) =>
          emit(context, "queryCompleted", payload),
        emitQueryFailed: (payload: AgentEventPayload) =>
          emit(context, "queryFailed", payload),
        emitEventCreated: (payload: AgentEventPayload) =>
          emit(context, "eventCreated", payload),
      };

      try {
        agent(context, event); // Call your provided agent logic
      } catch (e) {
        event.emitQueryFailed({
          data: e,
        });
        console.error("Error in agent execution:", e);
      }
    });

    call.on("error", (err: any) => {
      console.error(`[Agent] TaskStream error:`, err.message || err);
      setTimeout(startTaskStream, 3000); // Auto-reconnect
    });

    call.on("end", () => {
      console.warn(`[Agent] TaskStream ended by server`);
      setTimeout(startTaskStream, 3000); // Auto-reconnect
    });
  }

  // Start listening for tasks
  startTaskStream();

  process.on("exit", () => {
    console.log("Process exiting, restart if needed.");
  });

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
  });
}

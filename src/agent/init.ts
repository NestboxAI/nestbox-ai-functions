import pm2 from "pm2";
import { AgentHandler } from "../types/handler";
import { AgentEvents } from "../types/events";
import { BaseEventPayload, CompleteEventPayload } from "../types/payload";
import { AgentContext } from "../types/context";

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
  pm2.connect((err: any) => {
    if (err) {
      console.error("Error connecting to PM2:", err);
      process.exit(1);
    }

    console.log("Connected to PM2");

    async function sendMessageToProcess(payload: any): Promise<void> {
      return new Promise((resolve, reject) => {
        if (!process.send) {
          const err = new Error("IPC unavailable - not running under PM2");
          console.error(err.message);
          return reject(err);
        }

        const message = {
          type: "process:msg",
          data: { ...payload },
          timestamp: Date.now(),
        };

        console.log("Attempting to send: ", payload?.eventType);

        process.send(message, (err: any) => {
          if (err) {
            console.error("❌ Send failed:", err);
            return reject(err);
          }
          console.log("✅ Message acknowledged");
          resolve();
        });
      });
    }

    function createEventEmitter(
      context: AgentContext,
      eventKey: keyof typeof EVENT_CONFIGS
    ) {
      return async <T = any>(payload: BaseEventPayload<T>): Promise<CompleteEventPayload<BaseEventPayload<T>>> => {
        const config = EVENT_CONFIGS[eventKey];
        const completePayload = {
          ...payload,
          eventType: config.eventType,
          webhookListener: config.webhookListener,
          queryId: context.queryId,
          agentId: context.agentId,
          params: context.params,
        };
        await sendMessageToProcess(completePayload);
        return completePayload;
      };
    }

    process.on("message", (packet: any) => {
      if (packet.type === "process:msg") {
        const context = packet.data;

        const event: AgentEvents = {
          emitQueryCreated: createEventEmitter(context, "queryCreated"),
          emitQueryCompleted: createEventEmitter(context, "queryCompleted"),
          emitQueryFailed: createEventEmitter(context, "queryFailed"),
          emitEventCreated: createEventEmitter(context, "eventCreated"),
        };

        agent(context, event);
      }
    });

    process.on("exit", () => {
      console.log("Process exiting, disconnecting from PM2...");
      pm2.disconnect();
    });
  });
}
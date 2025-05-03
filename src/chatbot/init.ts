import pm2 from "pm2";
import { ChatbotHandler } from "../types/chatbot/handler";
import { ChatbotEvents } from "../types/chatbot/events";
import { ChatbotEventPayload } from "../types/chatbot/payload";
import { ChatbotContext } from "../types/chatbot/context";

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

export function initChatbot(chatbot: ChatbotHandler) {
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

    async function emit(
      context: ChatbotContext,
      eventKey: keyof typeof EVENT_CONFIGS,
      payload: ChatbotEventPayload
    ) {
      const config = EVENT_CONFIGS[eventKey];
      const completePayload = {
        ...payload,
        eventType: config.eventType,
        webhookListener: config.webhookListener,
        queryId: context.queryId,
        chatbotId: context.chatbotId,
        params: context.params,
      };
      await sendMessageToProcess(completePayload);
      return completePayload;
    }

    process.on("message", (packet: any) => {
      if (packet.type === "process:msg") {
        const context = packet.data;

        const event: ChatbotEvents = {
          emitQueryCreated: (payload: ChatbotEventPayload) => emit(context, "queryCreated", payload),
          emitQueryCompleted: (payload: ChatbotEventPayload) => emit(context, "queryCompleted", payload),
          emitQueryFailed: (payload: ChatbotEventPayload) => emit(context, "queryFailed", payload),
          emitEventCreated: (payload: ChatbotEventPayload) => emit(context, "eventCreated", payload),
        };
        
        try {
          chatbot(context, event);
        } catch (e) {
          event.emitQueryFailed({
            data: e,
          });
          console.error("Error in Chatbot execution:", e);
        }
      }
    });

    process.on("exit", () => {
      console.log("Process exiting, restart if needed.");
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection:", reason);
    });
    
    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
    });
  });
}
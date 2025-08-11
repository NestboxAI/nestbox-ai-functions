import { ChatbotHandler } from "../types/chatbot/handler";
import { ChatbotEvents } from "../types/chatbot/events";
import { ChatbotEventPayload } from "../types/chatbot/payload";
import { ChatbotContext } from "../types/chatbot/context";
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
const CHAT_ID = process.argv[2];

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

    console.log(`Chatbot ${CHAT_ID} starting`);

    async function sendMessageToProcess(payload: any): Promise<void> {
      return new Promise((resolve, reject) => {

        console.log("Attempting to send:", payload?.eventType);
  
        const message = {
          data: Buffer.from(JSON.stringify(payload || {}), 'utf8'),
          timestamp: Date.now(),
        };
  
        client.SendResult(message, (err: any, res: any) => {
          if (err) {
            console.error("❌ Failed to send result:", err);
            reject(err);
          } else {
            console.log("✅ Result sent successfully:", res);
            resolve();
          }
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

    function startTaskStream() {
      console.log(`Connecting TaskStream as ${CHAT_ID}`);
      const call = client.TaskStream({ agentId: CHAT_ID });
  
      call.on("data", (task: any) => {
        const context  = JSON.parse(task.payload.toString('utf8'));
        console.log(`Received:`, context);
        
        const event: ChatbotEvents = {
          emitQueryCreated: (payload: ChatbotEventPayload) => emit(context, "queryCreated", payload),
          emitQueryCompleted: (payload: ChatbotEventPayload) => emit(context, "queryCompleted", payload),
          emitQueryFailed: (payload: ChatbotEventPayload) => emit(context, "queryFailed", payload),
          emitEventCreated: (payload: ChatbotEventPayload) => emit(context, "eventCreated", payload),
        };
        
        try {
          chatbot(context, event); // Call your provided agent logic
        } catch (e) {
          event.emitQueryFailed({
            data: e,
          });
          console.error("Error in agent execution:", e);
        }
      });
  
      call.on("error", (err: any) => {
        console.error(`TaskStream error:`, err.message || err);
        setTimeout(startTaskStream, 3000); // Auto-reconnect
      });
  
      call.on("end", () => {
        console.warn(`TaskStream ended by server`);
        setTimeout(startTaskStream, 3000); // Auto-reconnect
      });
    }
  
    // Start listening for tasks
    startTaskStream();

    process.on("exit", () => {
      console.log("Process exiting, restart if needed.");
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection:", reason);
    });
    
    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
    });
}
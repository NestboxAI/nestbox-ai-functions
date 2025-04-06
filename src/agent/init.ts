import pm2 from "pm2";
import { AgentHandler } from "../types/handler";
import { AgentEvents } from "../types/events";

export function initAgent(agent: AgentHandler) {
  pm2.connect((err: any) => {
    if (err) {
      console.error("Error connecting to PM2:", err);
      process.exit(1);
    }

    console.log("Connected to PM2");

    async function sendMessageToProcess(payload: any) {
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
          resolve({});
        });
      });
    }

    process.on("message", (packet: any) => {
      if (packet.type === "process:msg") {
        const context = packet.data;

        const event: AgentEvents = {
          emitQueryCreated: async (payload: any) => {
            payload.eventType = "QUERY_CREATED";
            payload.webhookListiner = "emitQueryCreated";
            await sendMessageToProcess(payload);
          },
          emitQueryCompleted: async (payload: any) => {
            payload.eventType = "QUERY_COMPLETED";
            payload.webhookListiner = "emitQueryCompleted";
            await sendMessageToProcess(payload);
          },
          emitQueryFailed: async (payload: any) => {
            payload.eventType = "QUERY_FAILED";
            payload.webhookListiner = "emitQueryFailed";
            await sendMessageToProcess(payload);
          },
          emitEventCreated: async (payload: any) => {
            payload.eventType = "EVENT_CREATED";
            payload.webhookListiner = "emitEventCreated";
            await sendMessageToProcess(payload);
          },
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

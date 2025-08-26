import * as grpc from "@grpc/grpc-js";
import { getClient, closeClient, waitForServerReady } from "./grpc-client";
import { EVENT_CONFIGS, EventConfig } from "./event-configs";

export interface StreamManagerOptions {
  id: string;
  onTask: (task: any) => void;
  logPrefix: string;
}

export class StreamManager {
  private activeCall: grpc.ClientReadableStream<any> | null = null;
  private backoffMs = 1000;
  private readonly MAX_BACKOFF = 10000;
  private readonly options: StreamManagerOptions;

  constructor(options: StreamManagerOptions) {
    this.options = options;
  }

  async sendMessageToServer(payload: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const message = {
        data: Buffer.from(JSON.stringify(payload || {}), "utf8"),
        timestamp: Date.now(),
      };

      const clientInstance = getClient();
      clientInstance.SendResult(message, (err: any, res: any) => {
        if (err) {
          console.error("❌ Failed to send result:", err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async emit(
    context: any,
    eventKey: keyof typeof EVENT_CONFIGS,
    payload: any
  ) {
    const config = EVENT_CONFIGS[eventKey];
    const completePayload = {
      ...payload,
      eventType: config.eventType,
      webhookListener: config.webhookListener,
      queryId: context.queryId,
      params: context.params,
      // Include conditional fields based on context type
      ...(context.agentId && { agentId: context.agentId }),
      ...(context.chatbotId && { chatbotId: context.chatbotId }),
      ...(context.messages && { messages: context.messages }),
    };

    await this.sendMessageToServer(completePayload);
    return completePayload;
  }

  private startTaskStream() {
    if (this.activeCall) return;

    (async () => {
      try {
        await waitForServerReady(2000);
      } catch {
        this.scheduleReconnect();
        return;
      }

      const clientInstance = getClient();
      const call = clientInstance.TaskStream({ agentId: this.options.id });
      this.activeCall = call;
      this.backoffMs = 1000; // reset backoff

      call.on("data", (task: any) => {
        const context = JSON.parse(task.payload.toString("utf8"));
        this.options.onTask(context);
      });

      const onDisconnected = (reason?: any) => {
        if (this.activeCall === call) this.activeCall = null;
        console.warn(`TaskStream disconnected: ${reason?.message || reason}`);
        this.scheduleReconnect();
      };

      call.on("error", onDisconnected);
      call.on("end", onDisconnected);
      call.on("close", onDisconnected);
    })();
  }

  private scheduleReconnect() {
    const jitter = Math.floor(Math.random() * 300);
    const wait = Math.min(this.MAX_BACKOFF, this.backoffMs) + jitter;
    console.log(`Reconnecting in ${wait}ms`);
    setTimeout(() => {
      this.backoffMs = Math.min(this.MAX_BACKOFF, this.backoffMs * 2);
      this.startTaskStream();
    }, wait);
  }

  start() {
    console.log(`🟢 ${this.options.logPrefix} ${this.options.id} starting`);
    this.startTaskStream();
    this.setupProcessHandlers();
  }

  cleanup() {
    if (this.activeCall) {
      this.activeCall.cancel();
      this.activeCall = null;
    }
    closeClient();
  }

  private setupProcessHandlers() {
    const cleanup = () => {
      console.log(`${this.options.logPrefix} exiting`);
      this.cleanup();
    };

    process.on("exit", cleanup);
    process.on("SIGINT", () => {
      console.log("🔴 Received SIGINT, cleaning up...");
      this.cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      console.log("🔴 Received SIGTERM, cleaning up...");
      this.cleanup();
      process.exit(0);
    });
    process.on("unhandledRejection", (reason) =>
      console.error("Unhandled:", reason)
    );
    process.on("uncaughtException", (err) => console.error("Uncaught:", err));
  }
}

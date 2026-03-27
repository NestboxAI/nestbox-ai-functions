import { AgentHandler } from "../types/agent/handler";
import { AgentEvents } from "../types/agent/events";
import { AgentContext } from "../types/agent/context";
import { StreamManager } from "../common/stream-manager";

const AGENT_ID = process.argv[2];

export interface InitAgentOptions {
  /** Called with the StreamManager instance after creation but before start(). */
  onInit?: (streamManager: StreamManager) => void;
}

export function initAgent(agent: AgentHandler, options?: InitAgentOptions) {
  const streamManager = new StreamManager({
    id: AGENT_ID,
    logPrefix: "Agent",
    onTask: (context: AgentContext) => {
      const event: AgentEvents = {
        emitQueryCreated: (payload, files) => streamManager.emit(context, "queryCreated", payload, files),
        emitQueryCompleted: (payload, files) => streamManager.emit(context, "queryCompleted", payload, files),
        emitQueryFailed: (payload, files) => streamManager.emit(context, "queryFailed", payload, files),
        emitEventCreated: (payload, files) => streamManager.emit(context, "eventCreated", payload, files),
      };

      // Wrap agent execution in async context to handle both sync and async errors
      Promise.resolve()
        .then(() => agent(context, event))
        .catch((e) => {
          console.error("Agent execution failed:", e);
          event.emitQueryFailed({ data: e?.message || e });
        });
    },
  });

  if (options?.onInit) {
    options.onInit(streamManager);
  }

  streamManager.start();
}

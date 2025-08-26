import { ChatbotHandler } from "../types/chatbot/handler";
import { ChatbotEvents } from "../types/chatbot/events";
import { ChatbotContext } from "../types/chatbot/context";
import { StreamManager } from "../common/stream-manager";

const CHAT_ID = process.argv[2];

export function initChatbot(chatbot: ChatbotHandler) {
  const streamManager = new StreamManager({
    id: CHAT_ID,
    logPrefix: "Chatbot",
    onTask: (context: ChatbotContext) => {
      const event: ChatbotEvents = {
        emitQueryCreated: (payload) => streamManager.emit(context, "queryCreated", payload),
        emitQueryCompleted: (payload) => streamManager.emit(context, "queryCompleted", payload),
        emitQueryFailed: (payload) => streamManager.emit(context, "queryFailed", payload),
        emitEventCreated: (payload) => streamManager.emit(context, "eventCreated", payload),
      };

      // Wrap chatbot execution in async context to handle both sync and async errors
      Promise.resolve()
        .then(() => chatbot(context, event))
        .catch((e) => {
          console.error("Error in chatbot execution:", e);
          event.emitQueryFailed({ data: e?.message || e });
        });
    },
  });

  streamManager.start();
}

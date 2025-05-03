import { ChatbotContext } from "./context";
import { ChatbotEvents } from "./events";

export type ChatbotHandler = (context: ChatbotContext, events: ChatbotEvents) => any;

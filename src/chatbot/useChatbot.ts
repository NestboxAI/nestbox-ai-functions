import { ChatbotHandler } from "../types/chatbot/handler";

/**
 * 
 * @param chatbot - The chatbot function to be used
 * @returns 
 */
export function useChatbot(chatbot: ChatbotHandler) {
    return chatbot;
}
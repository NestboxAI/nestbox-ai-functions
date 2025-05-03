import { ChatbotMessage } from "./message";

/**
 * @license 
 * Interface of the context object used in the Chatbot
 */
export interface ChatbotContext {
    // the chatbot messages
    messages: ChatbotMessage[];

    // Parameters passed to the context, can be of any type.
    params: any;

    // A unique identifier for the query being processed.
    queryId: string;

    // An array of webhook group names associated with the context.
    webhookGroups: string[];

    // The unique identifier of the Chatbot handling the context.
    chatbotId: string;

    // The name of the Chatbot handling the context.
    chatbotName: string;
}
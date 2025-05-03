/**
 * Chatbot message types
 */
export interface ChatbotMessage {
    /**
     * The unique identifier for the message.
     * This is a required field.
     * @type {string}
     * @memberof ChatbotMessage
     * @example "12345"
     * @description The unique identifier for the message.
     */
    id: string;
    /**
     * The content of the message.
     * This is a required field.
     * @type {string}
     * @memberof ChatbotMessage
     * @example "Hello, how can I help you?"
     * @description The content of the message.
     */
    content: string;
    /**
     * Sender of the message.
     * @type {string}
     * @memberof ChatbotMessage
     * @example "system"
     * @description Sender of the message.
     */
    sender: string;
    /**
     * Timestamp of the message.
     * @type {number}
     * @memberof ChatbotMessage
     * @example 1633036800000
     * @description Timestamp of the message.
     */
    timestamp: number;
    /**
     * Attachments to the message.
     * @type {string}
     * @memberof ChatbotMessage
     * @example "text"
     * @description The type of the message.
     */
    attachments?: string[];    
}
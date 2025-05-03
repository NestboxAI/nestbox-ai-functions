/**
 * Base interface for all event payloads (user-provided portion)
 */
export interface ChatbotEventPayload<T = any> {
  // Additional data specific to the event
  data?: T;
}

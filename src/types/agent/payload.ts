/**
 * Base interface for all event payloads (user-provided portion)
 */
export interface AgentEventPayload<T = any> {
  // Additional data specific to the event
  data?: T;
}

/**
 * Represents a file reference to be included with an event.
 * Matches the WebhookFileReference on the server side.
 */
export interface EventFile {
  filePath: string;
  fieldName?: string;
  filename?: string;
  contentType?: string;
}

/**
 * Base interface for all event payloads (user-provided portion)
 */
export interface AgentEventPayload<T = any> {
  // Additional data specific to the event
  data?: T;
}

/**
 * Base properties that will be added to every event payload
 */
export interface EventBaseProperties {
    eventType: string;
    webhookListener: string;
    queryId: string;
    agentId: string;
    params: any;
  }
  
  /**
   * Base interface for all event payloads (user-provided portion)
   */
  export interface BaseEventPayload<T = any> {
    // Additional data specific to the event
    data?: T;
    
  }
  
  /**
   * Complete event type that combines user payload with system properties
   */
  export type CompleteEventPayload<P extends BaseEventPayload, T = any> = P & EventBaseProperties;
  
  /**
   * Specific event payload interfaces (user-provided portion)
   */
  export interface QueryCreatedPayload<T = any> extends BaseEventPayload<T> {
    // Add specific properties for query created events if needed
  }
  
  export interface QueryCompletedPayload<T = any> extends BaseEventPayload<T> {
    // Add specific properties for query completed events if needed
  }
  
  export interface QueryFailedPayload<T = any> extends BaseEventPayload<T> {
    // Add specific properties for query failed events if needed
  }
  
  export interface EventCreatedPayload<T = any> extends BaseEventPayload<T> {
    // Add specific properties for event created events if needed
  }
  
  /**
   * Type for the events object
   */
  export interface AgentEvents {
    emitQueryCreated: <T = any>(payload: QueryCreatedPayload<T>) => Promise<CompleteEventPayload<QueryCreatedPayload<T>>>;
    emitQueryCompleted: <T = any>(payload: QueryCompletedPayload<T>) => Promise<CompleteEventPayload<QueryCompletedPayload<T>>>;
    emitQueryFailed: <T = any>(payload: QueryFailedPayload<T>) => Promise<CompleteEventPayload<QueryFailedPayload<T>>>;
    emitEventCreated: <T = any>(payload: EventCreatedPayload<T>) => Promise<CompleteEventPayload<EventCreatedPayload<T>>>;
  }
/**
 * This module defines the Events interface for handling various events in the agent
 */
export interface AgentEvents {
    /**
     * Emits an event when a query is created.
     * @param event - An object containing the data related to the created query.
     */
    emitQueryCreated(event: { data: any }): void;

    /**
     * Emits an event when a query is successfully completed.
     * @param event - An object containing the data related to the completed query.
     */
    emitQueryCompleted(event: { data: any }): void;

    /**
     * Emits an event when a query fails.
     * @param event - An object containing the data related to the failed query.
     */
    emitQueryFailed(event: { data: any }): void;

    /**
     * Emits an event when a generic event is created.
     * @param event - An object containing the data related to the created event.
     */
    emitEventCreated(event: { data: any }): void;
}
// Mock event configurations - same as the real ones for testing
export const EVENT_CONFIGS = {
  queryCreated: {
    eventType: "QUERY_CREATED",
    webhookListener: "emitQueryCreated",
  },
  queryCompleted: {
    eventType: "QUERY_COMPLETED",
    webhookListener: "emitQueryCompleted",
  },
  queryFailed: {
    eventType: "QUERY_FAILED",
    webhookListener: "emitQueryFailed",
  },
  eventCreated: {
    eventType: "EVENT_CREATED",
    webhookListener: "emitEventCreated",
  },
};

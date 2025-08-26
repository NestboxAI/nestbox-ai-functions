export type EventConfig = {
  eventType: string;
  webhookListener: string;
};

export const EVENT_CONFIGS: Record<string, EventConfig> = {
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

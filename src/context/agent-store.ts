import { AsyncLocalStorage } from "async_hooks";

type LoggerContext = { queryId?: string };

export const loggerContext = new AsyncLocalStorage<LoggerContext>();

export function setLoggerContext(queryId?: string) {
  loggerContext.enterWith({ queryId });
}

export function getLoggerContext(): LoggerContext | undefined {
  return loggerContext.getStore();
}

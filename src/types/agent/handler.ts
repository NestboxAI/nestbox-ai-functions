import { AgentContext } from "./context";
import { AgentEvents } from "./events";

export type AgentHandler = (context: AgentContext, events: AgentEvents) => any;

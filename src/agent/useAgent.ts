import { AgentHandler } from "../types/agent/handler";

/**
 * 
 * @param agent - The agent function to be used
 * @param context - The context object containing parameters, queryId, webhookGroups, agentId, and agentName
 * @param events - The events object for handling various events
 * @returns 
 */
export function useAgent(agent: AgentHandler) {
    return agent;
}
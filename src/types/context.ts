/**
 * @license 
 * Interface of the context object used in the agent
 */
export interface Context {
    // Parameters passed to the context, can be of any type.
    params: any;

    // A unique identifier for the query being processed.
    queryId: string;

    // An array of webhook group names associated with the context.
    webhookGroups: string[];

    // The unique identifier of the agent handling the context.
    agentId: string;

    // The name of the agent handling the context.
    agentName: string;
}
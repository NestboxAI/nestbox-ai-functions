import * as crypto from 'crypto';
import { StreamManager } from './stream-manager';

export interface ClaudeAgentCallbacks {
  agentCompleted: (result: any) => void;
  agentFailed: (error: any) => void;
}

export interface ClaudeAgentStartContext {
  queryId: string;
  agentId: string;
  webhookGroups: any;
}

/**
 * Lightweight client for dispatching Claude SDK turns via gRPC.
 *
 * Created once per PM2 process (bound to the StreamManager). Each task
 * calls `start()` with its own context, params, and one-shot callbacks.
 * All communication goes through the existing gRPC broker — no HTTP.
 */
export class ClaudeAgentClient {
  private dispatchWaiters = new Map<
    string,
    {
      resolve: (r: { sessionId: string; jobId: string }) => void;
      reject: (e: Error) => void;
      callbacks: ClaudeAgentCallbacks;
    }
  >();
  private resultCallbacks = new Map<string, ClaudeAgentCallbacks>();

  constructor(private readonly streamManager: StreamManager) {
    this.streamManager.onMessage((payload) => this.handleMessage(payload));
  }

  private handleMessage(payload: any): boolean {
    if (payload._type === 'claude_agent.dispatch_ack') {
      const w = this.dispatchWaiters.get(payload.requestId);
      if (w) {
        this.dispatchWaiters.delete(payload.requestId);
        this.resultCallbacks.set(payload.jobId, w.callbacks);
        w.resolve({ sessionId: payload.sessionId, jobId: payload.jobId });
      }
      return true;
    }

    if (payload._type === 'claude_agent.dispatch_error') {
      const w = this.dispatchWaiters.get(payload.requestId);
      if (w) {
        this.dispatchWaiters.delete(payload.requestId);
        w.reject(new Error(payload.error));
      }
      return true;
    }

    if (payload._type === 'claude_agent.result') {
      const cbs = this.resultCallbacks.get(payload.jobId);
      if (cbs) {
        this.resultCallbacks.delete(payload.jobId); // auto-unregister
        if (payload.success) {
          cbs.agentCompleted(payload.data);
        } else {
          cbs.agentFailed(payload.error);
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Dispatch a Claude SDK turn and register one-shot callbacks for the result.
   *
   * Resolves with `{ sessionId, jobId }` once the dispatch is acknowledged.
   * The actual turn result arrives later via the registered callbacks.
   */
  async start(
    params: Record<string, unknown>,
    callbacks: ClaudeAgentCallbacks,
    context: ClaudeAgentStartContext,
  ): Promise<{ sessionId: string; jobId: string }> {
    const requestId = crypto.randomUUID();

    const ackPromise = new Promise<{ sessionId: string; jobId: string }>(
      (resolve, reject) => {
        this.dispatchWaiters.set(requestId, { resolve, reject, callbacks });
      },
    );

    await this.streamManager.sendMessageToServer({
      _type: 'claude_agent.start',
      requestId,
      machineAgentId: this.streamManager.id,
      queryId: context.queryId,
      agentId: context.agentId,
      webhookGroups: context.webhookGroups,
      params,
    });

    return ackPromise;
  }
}

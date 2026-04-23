import * as crypto from 'crypto';
import { StreamManager } from './stream-manager';

/**
 * Whitelisted event types for mid-turn progress events.
 * Extending this set requires a matching change in the Python sidecar
 * classifier and the spec (docs/plan/26-04-22-agent-events/spec.md §1.2).
 */
export type AgentEventType =
  | 'turn_started'
  | 'system_init'
  | 'assistant'
  | 'tool_use'
  | 'tool_result';

const _KNOWN_AGENT_EVENT_TYPES: ReadonlySet<string> = new Set<AgentEventType>([
  'turn_started',
  'system_init',
  'assistant',
  'tool_use',
  'tool_result',
]);

const DEFAULT_AGENT_EVENTS_TYPES: AgentEventType[] = ['turn_started'];
const DEFAULT_AGENT_EVENTS_THROTTLE_MS = 250;

/**
 * Caller-facing configuration for mid-turn events. Only meaningful when
 * `agentEventSent` is also provided on ClaudeAgentCallbacks. Placed on
 * `claudeParams.agentEvents`; the SDK splits it out before dispatch so the
 * sidecar does not see it as a ClaudeAgentOptions kwarg.
 */
export interface AgentEventsConfig {
  /** Whitelisted event types to emit. Unknown types are silently filtered. */
  types?: AgentEventType[];
  /**
   * Per-(job, event_type) leading-edge throttle. Default 250 ms.
   * Set to 0 to disable. Negative or non-finite values fall back to the default.
   */
  throttleMs?: number;
}

/** Delivered to the `agentEventSent` callback. */
export interface AgentEventMessage {
  jobId: string;
  sessionId: string;
  eventType: AgentEventType;
  /** Monotonic per turn. seq=0 is the synthetic turn_started. */
  seq: number;
  /** ISO-8601 UTC from the sidecar clock. */
  timestamp: string;
  /** Per-type body; see spec §1.2. May be `{ truncated: true, originalBytes }`. */
  payload: unknown;
}

export interface ClaudeAgentCallbacks {
  agentCompleted: (result: any) => void;
  agentFailed: (error: any) => void;
  /**
   * Optional. When provided, the dispatch opts into mid-turn events and
   * this callback fires zero or more times between dispatch and terminal.
   * Consumers must tolerate events arriving AFTER `agentCompleted` — gRPC
   * stream ordering across different RPCs is not guaranteed.
   */
  agentEventSent?: (event: AgentEventMessage) => void;
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

    if (payload._type === 'claude_agent.event') {
      const cbs = this.resultCallbacks.get(payload.jobId);
      if (cbs?.agentEventSent) {
        try {
          cbs.agentEventSent({
            jobId: payload.jobId,
            sessionId: payload.sessionId,
            eventType: payload.eventType,
            seq: payload.seq,
            timestamp: payload.timestamp,
            payload: payload.payload,
          });
        } catch (err) {
          // A throwing user callback must never tear down the client.
          console.error('agentEventSent callback threw:', err);
        }
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
   *
   * Mid-turn events: if `callbacks.agentEventSent` is provided, the SDK lifts
   * `params.agentEvents` (shape: AgentEventsConfig) out of params, validates
   * it against the whitelist, and forwards opt-in flags on the dispatch
   * payload. Callers that do not provide `agentEventSent` produce zero extra
   * gRPC, zero extra webhooks, and zero per-SDK-message cost in the sidecar.
   */
  async start(
    params: Record<string, unknown>,
    callbacks: ClaudeAgentCallbacks,
    context: ClaudeAgentStartContext,
  ): Promise<{ sessionId: string; jobId: string }> {
    const requestId = crypto.randomUUID();

    const { agentEvents, claudeParams } = splitAgentEvents(params);
    const emitAgentEvents = !!callbacks.agentEventSent;

    let agentEventsTypes: AgentEventType[] | undefined;
    let agentEventsThrottleMs: number | undefined;
    if (emitAgentEvents) {
      agentEventsTypes = validateTypes(agentEvents?.types);
      agentEventsThrottleMs = validateThrottleMs(agentEvents?.throttleMs);
    }

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
      params: claudeParams,
      emitAgentEvents,
      agentEventsTypes,
      agentEventsThrottleMs,
    });

    return ackPromise;
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function splitAgentEvents(
  params: Record<string, unknown> | null | undefined,
): { agentEvents: AgentEventsConfig | undefined; claudeParams: Record<string, unknown> } {
  const safe = (params ?? {}) as Record<string, unknown>;
  const { agentEvents, ...claudeParams } = safe as { agentEvents?: unknown } & Record<string, unknown>;
  return {
    agentEvents: isConfigObject(agentEvents) ? (agentEvents as AgentEventsConfig) : undefined,
    claudeParams,
  };
}

function isConfigObject(x: unknown): x is AgentEventsConfig {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function validateTypes(requested: unknown): AgentEventType[] {
  if (!Array.isArray(requested)) return [...DEFAULT_AGENT_EVENTS_TYPES];
  const filtered = requested.filter(
    (t): t is AgentEventType => typeof t === 'string' && _KNOWN_AGENT_EVENT_TYPES.has(t),
  );
  return filtered.length > 0 ? filtered : [...DEFAULT_AGENT_EVENTS_TYPES];
}

function validateThrottleMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return DEFAULT_AGENT_EVENTS_THROTTLE_MS;
  }
  return Math.floor(raw);
}

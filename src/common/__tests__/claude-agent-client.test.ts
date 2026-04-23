import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ClaudeAgentClient,
  ClaudeAgentCallbacks,
  AgentEventMessage,
  AgentEventType,
} from '../claude-agent-client';

// A StreamManager test double that captures the last outgoing payload and
// lets us inject inbound messages via the registered onMessage handler.
class FakeStreamManager {
  public readonly id = 'agent-test';
  public lastSent: any = null;
  private handlers: Array<(p: any) => boolean> = [];

  onMessage(handler: (p: any) => boolean): void {
    this.handlers.push(handler);
  }

  sendMessageToServer(payload: any): Promise<void> {
    this.lastSent = payload;
    return Promise.resolve();
  }

  inject(payload: any): void {
    for (const h of this.handlers) if (h(payload)) return;
  }
}

const makeContext = () => ({
  queryId: 'query-1',
  agentId: 'agent-1',
  webhookGroups: {},
});

const makeMinimalCallbacks = (): ClaudeAgentCallbacks => ({
  agentCompleted: vi.fn(),
  agentFailed: vi.fn(),
});

const dispatchAck = (sm: FakeStreamManager, jobId: string, sessionId: string) => {
  sm.inject({
    _type: 'claude_agent.dispatch_ack',
    requestId: sm.lastSent.requestId,
    jobId,
    sessionId,
  });
};

describe('ClaudeAgentClient', () => {
  let sm: FakeStreamManager;
  let client: ClaudeAgentClient;

  beforeEach(() => {
    sm = new FakeStreamManager();
    client = new ClaudeAgentClient(sm as any);
  });

  describe('start() — opt-in plumbing', () => {
    it('without agentEventSent ⇒ emitAgentEvents=false, no types/throttle on payload', async () => {
      const cbs = makeMinimalCallbacks();
      const p = client.start({ prompt: 'hi' }, cbs, makeContext());
      expect(sm.lastSent._type).toBe('claude_agent.start');
      expect(sm.lastSent.emitAgentEvents).toBe(false);
      expect(sm.lastSent.agentEventsTypes).toBeUndefined();
      expect(sm.lastSent.agentEventsThrottleMs).toBeUndefined();
      dispatchAck(sm, 'job-1', 'session-1');
      await p;
    });

    it('with agentEventSent and no config ⇒ defaults (["turn_started"], 250ms)', async () => {
      const cbs: ClaudeAgentCallbacks = {
        ...makeMinimalCallbacks(),
        agentEventSent: vi.fn(),
      };
      const p = client.start({ prompt: 'hi' }, cbs, makeContext());
      expect(sm.lastSent.emitAgentEvents).toBe(true);
      expect(sm.lastSent.agentEventsTypes).toEqual(['turn_started']);
      expect(sm.lastSent.agentEventsThrottleMs).toBe(250);
      dispatchAck(sm, 'job-1', 'session-1');
      await p;
    });

    it('lifts agentEvents out of params before forwarding', async () => {
      const cbs: ClaudeAgentCallbacks = {
        ...makeMinimalCallbacks(),
        agentEventSent: vi.fn(),
      };
      const p = client.start(
        {
          prompt: 'hi',
          agentEvents: { types: ['tool_use'], throttleMs: 400 },
        },
        cbs,
        makeContext(),
      );
      // agentEvents must NOT appear under params (would otherwise be forwarded
      // as a ClaudeAgentOptions kwarg by the sidecar).
      expect(sm.lastSent.params).toEqual({ prompt: 'hi' });
      expect(sm.lastSent.agentEventsTypes).toEqual(['tool_use']);
      expect(sm.lastSent.agentEventsThrottleMs).toBe(400);
      dispatchAck(sm, 'job-1', 'session-1');
      await p;
    });

    it('filters unknown types out; empty filtered list falls back to default', async () => {
      const cbs: ClaudeAgentCallbacks = {
        ...makeMinimalCallbacks(),
        agentEventSent: vi.fn(),
      };
      const p = client.start(
        {
          agentEvents: { types: ['turn_ended', 'bogus', 'tool_use'] as AgentEventType[] },
        },
        cbs,
        makeContext(),
      );
      expect(sm.lastSent.agentEventsTypes).toEqual(['tool_use']);
      dispatchAck(sm, 'job-1', 'session-1');
      await p;

      sm = new FakeStreamManager();
      client = new ClaudeAgentClient(sm as any);
      const p2 = client.start(
        { agentEvents: { types: ['totally-unknown'] as unknown as AgentEventType[] } },
        cbs,
        makeContext(),
      );
      expect(sm.lastSent.agentEventsTypes).toEqual(['turn_started']);
      dispatchAck(sm, 'job-2', 'session-2');
      await p2;
    });

    it('clamps throttleMs: negative / NaN / Infinity → default 250; non-integer floored', async () => {
      const cbs: ClaudeAgentCallbacks = {
        ...makeMinimalCallbacks(),
        agentEventSent: vi.fn(),
      };

      const cases: Array<[unknown, number]> = [
        [-5, 250],
        [NaN, 250],
        [Infinity, 250],
        ['250' as unknown, 250],
        [0, 0],
        [199.9, 199],
      ];
      for (const [input, expected] of cases) {
        sm = new FakeStreamManager();
        client = new ClaudeAgentClient(sm as any);
        const p = client.start(
          { agentEvents: { throttleMs: input as number } },
          cbs,
          makeContext(),
        );
        expect(sm.lastSent.agentEventsThrottleMs, `input=${String(input)}`).toBe(expected);
        dispatchAck(sm, 'job-x', 'session-x');
        await p;
      }
    });
  });

  describe('handleMessage() — claude_agent.event routing', () => {
    it('routes event to agentEventSent when registered; drops silently when not', async () => {
      const eventSpy: (event: AgentEventMessage) => void = vi.fn();
      const cbs: ClaudeAgentCallbacks = {
        ...makeMinimalCallbacks(),
        agentEventSent: eventSpy,
      };
      const p = client.start({}, cbs, makeContext());
      dispatchAck(sm, 'job-1', 'session-1');
      await p;

      sm.inject({
        _type: 'claude_agent.event',
        jobId: 'job-1',
        sessionId: 'session-1',
        eventType: 'tool_use',
        seq: 3,
        timestamp: '2026-04-23T00:00:00Z',
        payload: { toolName: 'Bash' },
      });

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy).toHaveBeenCalledWith({
        jobId: 'job-1',
        sessionId: 'session-1',
        eventType: 'tool_use',
        seq: 3,
        timestamp: '2026-04-23T00:00:00Z',
        payload: { toolName: 'Bash' },
      });

      // Event for an unknown jobId is silently dropped (no callback entry).
      sm.inject({
        _type: 'claude_agent.event',
        jobId: 'job-ghost',
        sessionId: 'session-ghost',
        eventType: 'assistant',
        seq: 1,
        timestamp: '2026-04-23T00:00:01Z',
        payload: {},
      });
      expect(eventSpy).toHaveBeenCalledTimes(1);
    });

    it('a throwing agentEventSent callback does not crash the client', async () => {
      const cbs: ClaudeAgentCallbacks = {
        ...makeMinimalCallbacks(),
        agentEventSent: vi.fn(() => {
          throw new Error('boom');
        }),
      };
      const p = client.start({}, cbs, makeContext());
      dispatchAck(sm, 'job-1', 'session-1');
      await p;

      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() =>
        sm.inject({
          _type: 'claude_agent.event',
          jobId: 'job-1',
          sessionId: 'session-1',
          eventType: 'assistant',
          seq: 1,
          timestamp: '2026-04-23T00:00:01Z',
          payload: {},
        }),
      ).not.toThrow();
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();

      // Subsequent terminal delivery must still work.
      sm.inject({
        _type: 'claude_agent.result',
        jobId: 'job-1',
        success: true,
        data: { ok: true },
      });
      expect(cbs.agentCompleted).toHaveBeenCalledWith({ ok: true });
    });

    it('agent_event arriving after agent_result is a no-op (subscription auto-cleared)', async () => {
      const eventSpy = vi.fn();
      const cbs: ClaudeAgentCallbacks = {
        ...makeMinimalCallbacks(),
        agentEventSent: eventSpy,
      };
      const p = client.start({}, cbs, makeContext());
      dispatchAck(sm, 'job-1', 'session-1');
      await p;

      sm.inject({
        _type: 'claude_agent.result',
        jobId: 'job-1',
        success: true,
        data: { ok: true },
      });
      sm.inject({
        _type: 'claude_agent.event',
        jobId: 'job-1',
        sessionId: 'session-1',
        eventType: 'tool_use',
        seq: 5,
        timestamp: '2026-04-23T00:00:05Z',
        payload: {},
      });

      expect(eventSpy).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { useAgent } from '../useAgent';
import type { AgentHandler } from '../../types/agent/handler';
import type { AgentContext } from '../../types/agent/context';
import type { AgentEvents } from '../../types/agent/events';

describe('useAgent', () => {
  it('should return the same agent function that was passed in', () => {
    const mockAgent: AgentHandler = vi.fn();
    
    const result = useAgent(mockAgent);
    
    expect(result).toBe(mockAgent);
  });

  it('should work with a functional agent', () => {
    const mockAgent: AgentHandler = (context: AgentContext, events: AgentEvents) => {
      return { success: true, queryId: context.queryId };
    };
    
    const result = useAgent(mockAgent);
    
    expect(typeof result).toBe('function');
    expect(result).toBe(mockAgent);
  });

  it('should preserve agent function behavior', () => {
    const mockContext: AgentContext = {
      queryId: 'test-query',
      agentId: 'test-agent',
      agentName: 'Test Agent',
      webhookGroups: ['group1'],
      params: { test: 'data' }
    };

    const mockEvents: AgentEvents = {
      emitQueryCreated: vi.fn(),
      emitQueryCompleted: vi.fn(),
      emitQueryFailed: vi.fn(),
      emitEventCreated: vi.fn(),
    };

    const mockAgent: AgentHandler = vi.fn((context, events) => {
      return { processed: true, context: context.queryId };
    });
    
    const wrappedAgent = useAgent(mockAgent);
    const result = wrappedAgent(mockContext, mockEvents);
    
    expect(mockAgent).toHaveBeenCalledWith(mockContext, mockEvents);
    expect(result).toEqual({ processed: true, context: 'test-query' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockStreamManager } from '../../__mocks__/grpc-client';
import type { AgentHandler } from '../../types/agent/handler';

// Mock the StreamManager
vi.mock('../../common/stream-manager', () => ({
  StreamManager: MockStreamManager,
}));

describe('Agent Init', () => {
  let initAgent: (agent: AgentHandler) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Import the module under test after mocks are set up
    const { initAgent: importedInitAgent } = await import('../init');
    initAgent = importedInitAgent;
  });

  describe('initAgent', () => {
    it('should initialize agent with StreamManager', () => {
      const mockAgent = vi.fn();

      initAgent(mockAgent);

      // Verify StreamManager was created with correct options
      expect(MockStreamManager).toHaveBeenCalledWith({
        id: 'test-agent-id',
        logPrefix: 'Agent',
        onTask: expect.any(Function),
      });
    });

    it('should handle incoming tasks and call agent handler', async () => {
      const mockAgent = vi.fn();

      initAgent(mockAgent);

      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;

      // Simulate receiving a task
      const testContext = {
        queryId: 'test-query',
        agentId: 'test-agent',
        params: { test: 'data' },
      };

      mockInstance.simulateTask(testContext);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify agent was called with correct context and events
      expect(mockAgent).toHaveBeenCalledWith(
        testContext,
        expect.objectContaining({
          emitQueryCreated: expect.any(Function),
          emitQueryCompleted: expect.any(Function),
          emitQueryFailed: expect.any(Function),
          emitEventCreated: expect.any(Function),
        })
      );
    });

    it('should emit events correctly', async () => {
      const mockAgent = vi.fn();

      initAgent(mockAgent);

      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;

      const testContext = {
        queryId: 'test-query',
        agentId: 'test-agent',
        params: { test: 'data' },
      };

      mockInstance.simulateTask(testContext);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Get the events object passed to the agent
      const eventsObject = mockAgent.mock.calls[0][1];

      // Test emitting an event
      await eventsObject.emitQueryCompleted({ data: 'test result' });

      // Verify the StreamManager's emit method was called
      expect(mockInstance.emit).toHaveBeenCalledWith(
        testContext,
        'queryCompleted',
        { data: 'test result' }
      );
    });

    it('should handle agent execution errors', async () => {
      const mockAgent = vi.fn().mockRejectedValue(new Error('Agent error'));

      initAgent(mockAgent);

      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;

      const testContext = {
        queryId: 'test-query',
        agentId: 'test-agent',
        params: { test: 'data' },
      };

      mockInstance.simulateTask(testContext);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify the emit method was called for error handling
      expect(mockInstance.emit).toHaveBeenCalledWith(
        testContext,
        'queryFailed',
        { data: 'Agent error' }
      );
    });

    it('should start the StreamManager', () => {
      const mockAgent = vi.fn();

      initAgent(mockAgent);

      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;

      // Verify start was called
      expect(mockInstance.start).toHaveBeenCalled();
    });
  });
});
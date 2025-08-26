import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockGrpcClient,
  MockGrpcClientReadableStream,
  createMockTaskPayload,
  createMockAgentContext,
  mockGrpc,
  mockProtoLoader,
} from '../../__mocks__/grpc-client';
import type { AgentHandler } from '../../types/agent/handler';
import type { AgentEvents } from '../../types/agent/events';

// Mock the dependencies before importing the module under test
vi.mock('@grpc/grpc-js', () => mockGrpc);
vi.mock('@grpc/proto-loader', () => mockProtoLoader);
vi.mock('path', () => ({
  default: {
    join: vi.fn(() => '/mock/path/agent.proto'),
  },
  join: vi.fn(() => '/mock/path/agent.proto'),
}));

describe('Agent Init', () => {
  let mockClient: ReturnType<typeof createMockGrpcClient>;
  let mockCall: MockGrpcClientReadableStream;
  let initAgent: (agent: AgentHandler) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Setup mock client
    mockClient = createMockGrpcClient();
    mockCall = mockClient.TaskStream() as MockGrpcClientReadableStream;

    // Mock the proto descriptor
    const mockAgentService = vi.fn(() => mockClient);
    mockGrpc.loadPackageDefinition.mockReturnValue({
      agent: { AgentService: mockAgentService },
    });

    // Clear module cache and import fresh instance
    vi.resetModules();
    const module = await import('../init');
    initAgent = module.initAgent;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.resetModules();
  });

  describe('initAgent', () => {
    it('should initialize agent and start task stream', async () => {
      const mockAgent: AgentHandler = vi.fn();
      
      initAgent(mockAgent);

      // Verify client is created and TaskStream is called
      expect(mockGrpc.loadPackageDefinition).toHaveBeenCalled();
      expect(mockClient.waitForReady).toHaveBeenCalled();
      
      // Wait for the task stream to be called
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockClient.TaskStream).toHaveBeenCalled();
    });

    it('should handle incoming tasks and call agent handler', async () => {
      const mockAgent: AgentHandler = vi.fn();
      const testContext = createMockAgentContext();
      const taskPayload = createMockTaskPayload(testContext);

      initAgent(mockAgent);

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate receiving a task
      mockCall.emitData(taskPayload);

      // Wait for async processing
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
      let capturedEvents: AgentEvents | null = null;
      const mockAgent: AgentHandler = vi.fn((context, events) => {
        capturedEvents = events;
      });
      
      const testContext = createMockAgentContext();
      const taskPayload = createMockTaskPayload(testContext);

      initAgent(mockAgent);

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate receiving a task
      mockCall.emitData(taskPayload);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Test event emission
      expect(capturedEvents).toBeDefined();
      if (capturedEvents) {
        await (capturedEvents as AgentEvents).emitQueryCreated({ data: 'test' });
        
        expect(mockClient.SendResult).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.any(Buffer),
            timestamp: expect.any(Number),
          }),
          expect.any(Function)
        );

        // Verify the payload structure
        const callArgs = mockClient.SendResult.mock.calls[0];
        const sentData = JSON.parse(callArgs[0].data.toString('utf8'));
        
        expect(sentData).toMatchObject({
          data: 'test',
          eventType: 'QUERY_CREATED',
          webhookListener: 'emitQueryCreated',
          queryId: testContext.queryId,
          agentId: testContext.agentId,
          params: testContext.params,
        });
      }
    });

    it('should handle agent execution errors', async () => {
      const mockAgent: AgentHandler = vi.fn(() => {
        throw new Error('Agent execution failed');
      });
      
      const testContext = createMockAgentContext();
      const taskPayload = createMockTaskPayload(testContext);

      initAgent(mockAgent);

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate receiving a task
      mockCall.emitData(taskPayload);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify error was handled and emitQueryFailed was called
      expect(mockClient.SendResult).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(Buffer),
        }),
        expect.any(Function)
      );

      const callArgs = mockClient.SendResult.mock.calls[0];
      const sentData = JSON.parse(callArgs[0].data.toString('utf8'));
      
      expect(sentData).toMatchObject({
        eventType: 'QUERY_FAILED',
        webhookListener: 'emitQueryFailed',
        data: 'Agent execution failed',
      });
    });

    it('should handle connection errors and reconnect', async () => {
      const mockAgent: AgentHandler = vi.fn();
      
      // Track call counts manually to avoid timing issues
      let waitForReadyCallCount = 0;
      mockClient.waitForReady.mockImplementation((deadline: any, callback: any) => {
        waitForReadyCallCount++;
        if (waitForReadyCallCount === 1) {
          setTimeout(() => callback(new Error('Connection failed')), 10);
        } else {
          setTimeout(() => callback(), 10);
        }
      });

      initAgent(mockAgent);

      // Wait for initial connection attempt and potential reconnection
      await new Promise(resolve => setTimeout(resolve, 100));
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait longer for CI
      
      // Verify at least one reconnection attempt was made
      expect(waitForReadyCallCount).toBeGreaterThanOrEqual(2);
    });

    it('should handle stream disconnection and reconnect', async () => {
      const mockAgent: AgentHandler = vi.fn();
      
      initAgent(mockAgent);

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 20));

      const initialCallCount = mockClient.TaskStream.mock.calls.length;

      // Simulate stream error
      mockCall.emitError(new Error('Stream error'));

      // Wait for reconnection (longer timeout for CI)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify reconnection attempt (should have more calls than initially)
      const finalCallCount = mockClient.TaskStream.mock.calls.length;
      expect(finalCallCount).toBeGreaterThanOrEqual(initialCallCount + 1);
    });

    it('should handle SendResult errors', async () => {
      let capturedEvents: AgentEvents | null = null;
      const mockAgent: AgentHandler = vi.fn((context, events) => {
        capturedEvents = events;
      });
      
      // Mock SendResult to fail
      mockClient.SendResult.mockImplementation((message: any, callback: any) => {
        setTimeout(() => callback(new Error('Send failed')), 0);
      });

      const testContext = createMockAgentContext();
      const taskPayload = createMockTaskPayload(testContext);

      initAgent(mockAgent);

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate receiving a task
      mockCall.emitData(taskPayload);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Try to emit an event (should handle the error)
      if (capturedEvents) {
        await expect((capturedEvents as AgentEvents).emitQueryCreated({ data: 'test' })).rejects.toThrow('Send failed');
      }
    });
  });

  describe('Event emission', () => {
    it('should emit queryCompleted event correctly', async () => {
      let capturedEvents: AgentEvents | null = null;
      const mockAgent: AgentHandler = vi.fn((context, events) => {
        capturedEvents = events;
      });
      
      const testContext = createMockAgentContext();
      const taskPayload = createMockTaskPayload(testContext);

      initAgent(mockAgent);
      await new Promise(resolve => setTimeout(resolve, 10));

      mockCall.emitData(taskPayload);
      await new Promise(resolve => setTimeout(resolve, 10));

      if (capturedEvents) {
        await (capturedEvents as AgentEvents).emitQueryCompleted({ data: 'completed' });
        
        const callArgs = mockClient.SendResult.mock.calls[0];
        const sentData = JSON.parse(callArgs[0].data.toString('utf8'));
        
        expect(sentData).toMatchObject({
          data: 'completed',
          eventType: 'QUERY_COMPLETED',
          webhookListener: 'emitQueryCompleted',
        });
      }
    });

    it('should emit eventCreated event correctly', async () => {
      let capturedEvents: AgentEvents | null = null;
      const mockAgent: AgentHandler = vi.fn((context, events) => {
        capturedEvents = events;
      });
      
      const testContext = createMockAgentContext();
      const taskPayload = createMockTaskPayload(testContext);

      initAgent(mockAgent);
      await new Promise(resolve => setTimeout(resolve, 10));

      mockCall.emitData(taskPayload);
      await new Promise(resolve => setTimeout(resolve, 10));

      if (capturedEvents) {
        await (capturedEvents as AgentEvents).emitEventCreated({ data: 'event data' });
        
        const callArgs = mockClient.SendResult.mock.calls[0];
        const sentData = JSON.parse(callArgs[0].data.toString('utf8'));
        
        expect(sentData).toMatchObject({
          data: 'event data',
          eventType: 'EVENT_CREATED',
          webhookListener: 'emitEventCreated',
        });
      }
    });
  });
});

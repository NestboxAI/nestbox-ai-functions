import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockGrpcClient,
  MockGrpcClientReadableStream,
  createMockTaskPayload,
  createMockChatbotContext,
  mockGrpc,
  mockProtoLoader,
} from '../../__mocks__/grpc-client';
import type { ChatbotHandler } from '../../types/chatbot/handler';
import type { ChatbotEvents } from '../../types/chatbot/events';

// Mock the dependencies before importing the module under test
vi.mock('@grpc/grpc-js', () => mockGrpc);
vi.mock('@grpc/proto-loader', () => mockProtoLoader);
vi.mock('path', () => ({
  default: {
    join: vi.fn(() => '/mock/path/agent.proto'),
  },
  join: vi.fn(() => '/mock/path/agent.proto'),
}));

describe('Chatbot Init', () => {
  let mockClient: ReturnType<typeof createMockGrpcClient>;
  let mockCall: MockGrpcClientReadableStream;
  let initChatbot: (chatbot: ChatbotHandler) => void;

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
    const module = await import('../../chatbot/init');
    initChatbot = module.initChatbot;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.resetModules();
  });

  describe('initChatbot', () => {
    it('should initialize chatbot and start task stream', async () => {
      const mockChatbot: ChatbotHandler = vi.fn();
      
      initChatbot(mockChatbot);

      // Verify client is created and TaskStream is called
      expect(mockGrpc.loadPackageDefinition).toHaveBeenCalled();
      expect(mockClient.waitForReady).toHaveBeenCalled();
      
      // Wait for the task stream to be called
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockClient.TaskStream).toHaveBeenCalled();
    });

    it('should handle incoming tasks and call chatbot handler', async () => {
      const mockChatbot: ChatbotHandler = vi.fn();
      const testContext = createMockChatbotContext();
      const taskPayload = createMockTaskPayload(testContext);

      initChatbot(mockChatbot);

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate receiving a task
      mockCall.emitData(taskPayload);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify chatbot was called with correct context and events
      expect(mockChatbot).toHaveBeenCalledWith(
        testContext,
        expect.objectContaining({
          emitQueryCreated: expect.any(Function),
          emitQueryCompleted: expect.any(Function),
          emitQueryFailed: expect.any(Function),
          emitEventCreated: expect.any(Function),
        })
      );
    });

    it('should emit events correctly with chatbot context', async () => {
      let capturedEvents: ChatbotEvents | null = null;
      const mockChatbot: ChatbotHandler = vi.fn((context, events) => {
        capturedEvents = events;
      });
      
      const testContext = createMockChatbotContext();
      const taskPayload = createMockTaskPayload(testContext);

      initChatbot(mockChatbot);

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate receiving a task
      mockCall.emitData(taskPayload);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Test event emission
      expect(capturedEvents).toBeDefined();
      if (capturedEvents) {
        await (capturedEvents as ChatbotEvents).emitQueryCreated({ data: 'test' });
        
        expect(mockClient.SendResult).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.any(Buffer),
            timestamp: expect.any(Number),
          }),
          expect.any(Function)
        );

        // Verify the payload structure includes chatbot-specific fields
        const callArgs = mockClient.SendResult.mock.calls[0];
        const sentData = JSON.parse(callArgs[0].data.toString('utf8'));
        
        expect(sentData).toMatchObject({
          data: 'test',
          eventType: 'QUERY_CREATED',
          webhookListener: 'emitQueryCreated',
          queryId: testContext.queryId,
          chatbotId: testContext.chatbotId,
          params: testContext.params,
          messages: testContext.messages,
        });
      }
    });

    it('should handle chatbot execution errors', async () => {
      const mockChatbot: ChatbotHandler = vi.fn(() => {
        throw new Error('Chatbot execution failed');
      });
      
      const testContext = createMockChatbotContext();
      const taskPayload = createMockTaskPayload(testContext);

      initChatbot(mockChatbot);

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
        data: 'Chatbot execution failed',
      });
    });

    it('should handle connection errors and reconnect', async () => {
      const mockChatbot: ChatbotHandler = vi.fn();
      
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

      initChatbot(mockChatbot);

      // Wait for initial connection attempt and potential reconnection
      await new Promise(resolve => setTimeout(resolve, 100));
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait longer for CI

      // Verify at least one reconnection attempt was made
      expect(waitForReadyCallCount).toBeGreaterThanOrEqual(2);
    });

    it('should handle stream disconnection and reconnect', async () => {
      const mockChatbot: ChatbotHandler = vi.fn();
      
      initChatbot(mockChatbot);

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 20));

      const initialCallCount = mockClient.TaskStream.mock.calls.length;

      // Simulate stream error
      mockCall.emitError(new Error('Stream error'));

      // Wait for reconnection (longer for CI)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify reconnection attempt (should have more calls than initially)
      const finalCallCount = mockClient.TaskStream.mock.calls.length;
      expect(finalCallCount).toBeGreaterThanOrEqual(initialCallCount + 1);
    });

    it('should use SendResult method for chatbot (not SendMessage)', async () => {
      let capturedEvents: ChatbotEvents | null = null;
      const mockChatbot: ChatbotHandler = vi.fn((context, events) => {
        capturedEvents = events;
      });
      
      const testContext = createMockChatbotContext();
      const taskPayload = createMockTaskPayload(testContext);

      initChatbot(mockChatbot);
      await new Promise(resolve => setTimeout(resolve, 10));

      mockCall.emitData(taskPayload);
      await new Promise(resolve => setTimeout(resolve, 10));

      if (capturedEvents) {
        await (capturedEvents as ChatbotEvents).emitQueryCompleted({ data: 'completed' });
        
        // Verify SendResult is used (not SendMessage)
        expect(mockClient.SendResult).toHaveBeenCalled();
        
        const callArgs = mockClient.SendResult.mock.calls[0];
        const sentData = JSON.parse(callArgs[0].data.toString('utf8'));
        
        expect(sentData).toMatchObject({
          data: 'completed',
          eventType: 'QUERY_COMPLETED',
          webhookListener: 'emitQueryCompleted',
        });
      }
    });
  });
});

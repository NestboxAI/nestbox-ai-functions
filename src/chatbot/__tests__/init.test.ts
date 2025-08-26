import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockStreamManager } from '../../__mocks__/grpc-client';
import type { ChatbotHandler } from '../../types/chatbot/handler';

// Mock the StreamManager
vi.mock('../../common/stream-manager', () => ({
  StreamManager: MockStreamManager,
}));

describe('Chatbot Init', () => {
  let initChatbot: (chatbot: ChatbotHandler) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Import the module under test after mocks are set up
    const { initChatbot: importedInitChatbot } = await import('../init');
    initChatbot = importedInitChatbot;
  });

  describe('initChatbot', () => {
    it('should initialize chatbot with StreamManager', () => {
      const mockChatbot = vi.fn();

      initChatbot(mockChatbot);

      // Verify StreamManager was created with correct options
      expect(MockStreamManager).toHaveBeenCalledWith({
        id: 'test-agent-id',
        logPrefix: 'Chatbot',
        onTask: expect.any(Function),
      });
    });

    it('should handle incoming tasks and call chatbot handler', async () => {
      const mockChatbot = vi.fn();

      initChatbot(mockChatbot);

      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;

      // Simulate receiving a task
      const testContext = {
        queryId: 'test-query',
        chatbotId: 'test-chatbot',
        params: { test: 'data' },
        messages: [{ role: 'user', content: 'Hello' }],
      };

      mockInstance.simulateTask(testContext);

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
      const mockChatbot = vi.fn();

      initChatbot(mockChatbot);

      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;

      const testContext = {
        queryId: 'test-query',
        chatbotId: 'test-chatbot',
        params: { test: 'data' },
        messages: [{ role: 'user', content: 'Hello' }],
      };

      mockInstance.simulateTask(testContext);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Get the events object passed to the chatbot
      const eventsObject = mockChatbot.mock.calls[0][1];

      // Test emitting an event
      await eventsObject.emitQueryCompleted({ data: 'chatbot response' });

      // Verify the StreamManager's emit method was called
      expect(mockInstance.emit).toHaveBeenCalledWith(
        testContext,
        'queryCompleted',
        { data: 'chatbot response' }
      );
    });

    it('should handle chatbot execution errors', async () => {
      const mockChatbot = vi.fn().mockRejectedValue(new Error('Chatbot error'));

      initChatbot(mockChatbot);

      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;

      const testContext = {
        queryId: 'test-query',
        chatbotId: 'test-chatbot',
        params: { test: 'data' },
        messages: [{ role: 'user', content: 'Hello' }],
      };

      mockInstance.simulateTask(testContext);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify the emit method was called for error handling
      expect(mockInstance.emit).toHaveBeenCalledWith(
        testContext,
        'queryFailed',
        { data: 'Chatbot error' }
      );
    });

    it('should start the StreamManager', () => {
      const mockChatbot = vi.fn();

      initChatbot(mockChatbot);

      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;

      // Verify start was called
      expect(mockInstance.start).toHaveBeenCalled();
    });
  });
});
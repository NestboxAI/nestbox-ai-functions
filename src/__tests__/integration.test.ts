import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MockStreamManager,
  createMockTaskPayload,
  createMockAgentContext,
  createMockChatbotContext,
} from '../__mocks__/grpc-client';
import type { AgentHandler } from '../types/agent/handler';
import type { ChatbotHandler } from '../types/chatbot/handler';

// Mock the StreamManager
vi.mock('../common/stream-manager', () => ({
  StreamManager: MockStreamManager,
}));

describe('Integration Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Agent and Chatbot Integration', () => {
    it('should work with both agent and chatbot using same mock infrastructure', async () => {
      // Import modules after mocks are set up
      const agentModule = await import('../agent/init');
      const chatbotModule = await import('../chatbot/init');
      
      const { initAgent } = agentModule;
      const { initChatbot } = chatbotModule;

      // Create handlers
      const agentResults: any[] = [];
      const chatbotResults: any[] = [];

      const testAgent: AgentHandler = vi.fn((context, events) => {
        agentResults.push({ type: 'agent', context });
        events.emitQueryCompleted({ data: 'agent-completed' });
      });

      const testChatbot: ChatbotHandler = vi.fn((context, events) => {
        chatbotResults.push({ type: 'chatbot', context });
        events.emitQueryCompleted({ data: 'chatbot-completed' });
      });

      // Initialize both
      initAgent(testAgent);
      initChatbot(testChatbot);

      // Get the mock instances
      const agentMockInstance = MockStreamManager.mock.results[0].value;
      const chatbotMockInstance = MockStreamManager.mock.results[1].value;

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      // Send tasks to both
      const agentContext = createMockAgentContext({ agentId: 'agent-1' });
      const chatbotContext = createMockChatbotContext({ chatbotId: 'chatbot-1' });

      agentMockInstance.simulateTask(agentContext);
      chatbotMockInstance.simulateTask(chatbotContext);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify both handlers were called
      expect(testAgent).toHaveBeenCalledWith(
        agentContext,
        expect.objectContaining({
          emitQueryCreated: expect.any(Function),
          emitQueryCompleted: expect.any(Function),
          emitQueryFailed: expect.any(Function),
          emitEventCreated: expect.any(Function),
        })
      );

      expect(testChatbot).toHaveBeenCalledWith(
        chatbotContext,
        expect.objectContaining({
          emitQueryCreated: expect.any(Function),
          emitQueryCompleted: expect.any(Function),
          emitQueryFailed: expect.any(Function),
          emitEventCreated: expect.any(Function),
        })
      );

      // Verify results were collected
      expect(agentResults).toHaveLength(1);
      expect(chatbotResults).toHaveLength(1);
      
      expect(agentResults[0]).toMatchObject({
        type: 'agent',
        context: agentContext,
      });
      
      expect(chatbotResults[0]).toMatchObject({
        type: 'chatbot',
        context: chatbotContext,
      });

      // Verify emit was called for both completions
      expect(agentMockInstance.emit).toHaveBeenCalledWith(
        agentContext,
        'queryCompleted',
        { data: 'agent-completed' }
      );
      expect(chatbotMockInstance.emit).toHaveBeenCalledWith(
        chatbotContext,
        'queryCompleted',
        { data: 'chatbot-completed' }
      );
    });

    it('should handle errors in both agent and chatbot', async () => {
      const agentModule = await import('../agent/init');
      const chatbotModule = await import('../chatbot/init');
      
      const { initAgent } = agentModule;
      const { initChatbot } = chatbotModule;

      const errorAgent: AgentHandler = vi.fn(() => {
        throw new Error('Agent error');
      });

      const errorChatbot: ChatbotHandler = vi.fn(() => {
        throw new Error('Chatbot error');
      });

      initAgent(errorAgent);
      initChatbot(errorChatbot);

      // Get the mock instances
      const agentMockInstance = MockStreamManager.mock.results[0].value;
      const chatbotMockInstance = MockStreamManager.mock.results[1].value;

      await new Promise(resolve => setTimeout(resolve, 10));

      // Send tasks that will cause errors
      agentMockInstance.simulateTask(createMockAgentContext());
      chatbotMockInstance.simulateTask(createMockChatbotContext());

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify both errors were handled and emit was called with queryFailed
      expect(agentMockInstance.emit).toHaveBeenCalledWith(
        expect.any(Object),
        'queryFailed',
        { data: 'Agent error' }
      );

      expect(chatbotMockInstance.emit).toHaveBeenCalledWith(
        expect.any(Object),
        'queryFailed',
        { data: 'Chatbot error' }
      );
    });
  });

  describe('Mock Utilities', () => {
    it('should provide comprehensive mock functionality', () => {
      // Test MockStreamManager functionality
      const mockInstance = new MockStreamManager({
        type: 'agent',
        onTask: vi.fn(),
      });
      
      expect(mockInstance.emit).toBeDefined();
      expect(mockInstance.simulateTask).toBeDefined();
      expect(typeof mockInstance.emit).toBe('function');
      expect(typeof mockInstance.simulateTask).toBe('function');
    });

    it('should create proper mock contexts', () => {
      const agentContext = createMockAgentContext({ 
        agentId: 'custom-agent',
        params: { custom: 'data' } 
      });
      
      expect(agentContext).toMatchObject({
        queryId: 'test-query-id',
        agentId: 'custom-agent',
        agentName: 'test-agent',
        webhookGroups: ['test-group'],
        params: { custom: 'data' },
      });

      const chatbotContext = createMockChatbotContext({
        chatbotId: 'custom-chatbot',
        messages: [{ role: 'assistant', content: 'custom message' }]
      });

      expect(chatbotContext).toMatchObject({
        queryId: 'test-query-id',
        chatbotId: 'custom-chatbot',
        chatbotName: 'test-chatbot',
        webhookGroups: ['test-group'],
        params: { test: 'data' },
        messages: [{ role: 'assistant', content: 'custom message' }],
      });
    });

    it('should create proper task payloads', () => {
      const context = createMockAgentContext();
      const payload = createMockTaskPayload(context);
      
      expect(payload).toMatchObject({
        payload: expect.any(Buffer),
      });

      const parsed = JSON.parse(payload.payload.toString('utf8'));
      expect(parsed).toEqual(context);
    });
  });
});

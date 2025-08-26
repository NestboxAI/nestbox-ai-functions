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

describe('Example Custom Agent/Chatbot Tests', () => {
  let initAgent: (agent: AgentHandler) => void;
  let initChatbot: (chatbot: ChatbotHandler) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Import fresh modules
    const agentModule = await import('../agent/init');
    const chatbotModule = await import('../chatbot/init');
    initAgent = agentModule.initAgent;
    initChatbot = chatbotModule.initChatbot;
  });

  describe('Math Agent', () => {
    it('should solve arithmetic problems', async () => {
      const mathAgent: AgentHandler = vi.fn(async (context, events) => {
        const { operation, numbers } = context.params;
        let result: number;

        switch (operation) {
          case 'add':
            result = numbers.reduce((sum: number, num: number) => sum + num, 0);
            break;
          case 'multiply':
            result = numbers.reduce((product: number, num: number) => product * num, 1);
            break;
          default:
            throw new Error(`Unsupported operation: ${operation}`);
        }

        await events.emitQueryCompleted({ 
          data: { result, operation, numbers } 
        });
      });

      // Test addition
      const addContext = createMockAgentContext({
        params: { operation: 'add', numbers: [1, 2, 3, 4] }
      });

      initAgent(mathAgent);
      
      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;
      
      await new Promise(resolve => setTimeout(resolve, 10));

      mockInstance.simulateTask(addContext);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mathAgent).toHaveBeenCalledWith(addContext, expect.any(Object));
      expect(mockInstance.emit).toHaveBeenCalledWith(
        addContext,
        'queryCompleted',
        { data: { result: 10, operation: 'add', numbers: [1, 2, 3, 4] } }
      );
    });

    it('should handle unsupported operations', async () => {
      const mathAgent: AgentHandler = vi.fn(async (context, events) => {
        const { operation, numbers } = context.params;
        
        if (operation !== 'add' && operation !== 'multiply') {
          throw new Error(`Unsupported operation: ${operation}`);
        }
      });

      const invalidContext = createMockAgentContext({
        params: { operation: 'divide', numbers: [10, 2] }
      });

      initAgent(mathAgent);
      
      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;
      
      await new Promise(resolve => setTimeout(resolve, 10));

      mockInstance.simulateTask(invalidContext);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInstance.emit).toHaveBeenCalledWith(
        invalidContext,
        'queryFailed',
        { data: 'Unsupported operation: divide' }
      );
    });
  });

  describe('Greeting Chatbot', () => {
    it('should respond to user greetings', async () => {
      const greetingChatbot: ChatbotHandler = vi.fn(async (context, events) => {
        const userMessage = context.messages[context.messages.length - 1];
        
        await events.emitQueryCompleted({ 
          data: { 
            response: 'Hello! How can I help you today?',
            originalMessage: userMessage.content 
          } 
        });
      });

      const greetingContext = createMockChatbotContext({
        messages: [
          { role: 'user', content: 'Hello there!' }
        ]
      });

      initChatbot(greetingChatbot);
      
      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;
      
      await new Promise(resolve => setTimeout(resolve, 10));

      mockInstance.simulateTask(greetingContext);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(greetingChatbot).toHaveBeenCalledWith(greetingContext, expect.any(Object));

      expect(mockInstance.emit).toHaveBeenCalledWith(
        greetingContext,
        'queryCompleted',
        {
          data: { 
            response: 'Hello! How can I help you today?',
            originalMessage: 'Hello there!'
          }
        }
      );
    });

    it('should handle conversation context', async () => {
      const contextAwareChatbot: ChatbotHandler = vi.fn(async (context, events) => {
        const messageCount = context.messages.length;
        const lastMessage = context.messages[messageCount - 1];

        await events.emitQueryCompleted({ 
          data: { 
            messageCount,
            lastMessage: lastMessage.content,
            conversationSummary: `This conversation has ${messageCount} messages.`
          } 
        });
      });

      const conversationContext = createMockChatbotContext({
        messages: [
          { role: 'assistant', content: 'Hello! How can I help?' },
          { role: 'user', content: 'I need help with my project' },
          { role: 'assistant', content: 'Sure! What kind of project?' },
          { role: 'user', content: 'A web application' }
        ]
      });

      initChatbot(contextAwareChatbot);
      
      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;
      
      await new Promise(resolve => setTimeout(resolve, 10));

      mockInstance.simulateTask(conversationContext);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInstance.emit).toHaveBeenCalledWith(
        conversationContext,
        'queryCompleted',
        {
          data: {
            messageCount: 4,
            lastMessage: 'A web application',
            conversationSummary: 'This conversation has 4 messages.'
          }
        }
      );
    });
  });

  describe('Data Processing Agent', () => {
    it('should process and transform data', async () => {
      const dataAgent: AgentHandler = vi.fn(async (context, events) => {
        const { action, data } = context.params;

        if (action === 'sum') {
          const result = data.reduce((sum: number, num: number) => sum + num, 0);
          await events.emitQueryCompleted({ data: { result, action } });
        } else if (action === 'filter') {
          const result = data.filter((num: number) => num > 5);
          await events.emitQueryCompleted({ data: { result, action, original: data } });
        }
      });

      // Test sum operation
      const sumContext = createMockAgentContext({
        params: { action: 'sum', data: [10, 20, 30] }
      });

      initAgent(dataAgent);
      
      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;
      
      await new Promise(resolve => setTimeout(resolve, 10));

      mockInstance.simulateTask(sumContext);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInstance.emit).toHaveBeenCalledWith(
        sumContext,
        'queryCompleted',
        { data: { result: 60, action: 'sum' } }
      );

      // Clear the mock for the next test
      vi.clearAllMocks();

      // Test filter operation
      const filterContext = createMockAgentContext({
        params: { action: 'filter', data: [1, 3, 8, 12, 4, 9] }
      });

      // Initialize a fresh agent
      initAgent(dataAgent);
      const newMockInstance = MockStreamManager.mock.results[0].value;

      await new Promise(resolve => setTimeout(resolve, 10));

      newMockInstance.simulateTask(filterContext);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(newMockInstance.emit).toHaveBeenCalledWith(
        filterContext,
        'queryCompleted',
        { data: { result: [8, 12, 9], action: 'filter', original: [1, 3, 8, 12, 4, 9] } }
      );
    });
  });

  describe('Event Logging Agent', () => {
    it('should emit multiple events during processing', async () => {
      const loggingAgent: AgentHandler = vi.fn(async (context, events) => {
        await events.emitQueryCreated({ step: 'started', timestamp: Date.now() });
        await events.emitEventCreated({ step: 'processing', timestamp: Date.now() });
        await events.emitQueryCompleted({ 
          step: 'completed', 
          result: 'success',
          timestamp: Date.now() 
        });
      });

      const context = createMockAgentContext({
        params: { task: 'multi-step-process' }
      });

      initAgent(loggingAgent);
      
      // Get the mock instance
      const mockInstance = MockStreamManager.mock.results[0].value;
      
      await new Promise(resolve => setTimeout(resolve, 10));

      mockInstance.simulateTask(context);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have 3 emit calls (created, event, completed)
      expect(mockInstance.emit).toHaveBeenCalledTimes(3);

      expect(mockInstance.emit).toHaveBeenNthCalledWith(
        1,
        context,
        'queryCreated',
        expect.objectContaining({ step: 'started' })
      );

      expect(mockInstance.emit).toHaveBeenNthCalledWith(
        2,
        context,
        'eventCreated',
        expect.objectContaining({ step: 'processing' })
      );

      expect(mockInstance.emit).toHaveBeenNthCalledWith(
        3,
        context,
        'queryCompleted',
        expect.objectContaining({ step: 'completed', result: 'success' })
      );
    });
  });
});

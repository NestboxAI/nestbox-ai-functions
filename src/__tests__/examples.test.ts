import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockGrpcClient,
  MockGrpcClientReadableStream,
  createMockTaskPayload,
  createMockAgentContext,
  createMockChatbotContext,
  mockGrpc,
  mockProtoLoader,
} from '../__mocks__/grpc-client';
import type { AgentHandler } from '../types/agent/handler';
import type { ChatbotHandler } from '../types/chatbot/handler';

// Mock the dependencies
vi.mock('@grpc/grpc-js', () => mockGrpc);
vi.mock('@grpc/proto-loader', () => mockProtoLoader);
vi.mock('path', () => ({
  default: {
    join: vi.fn(() => '/mock/path/agent.proto'),
  },
  join: vi.fn(() => '/mock/path/agent.proto'),
}));

describe('Example Custom Agent/Chatbot Tests', () => {
  let mockClient: ReturnType<typeof createMockGrpcClient>;
  let mockCall: MockGrpcClientReadableStream;
  let initAgent: (agent: AgentHandler) => void;
  let initChatbot: (chatbot: ChatbotHandler) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    
    // Setup mock client
    mockClient = createMockGrpcClient();
    mockCall = mockClient.TaskStream() as MockGrpcClientReadableStream;

    // Mock the proto descriptor
    const mockAgentService = vi.fn(() => mockClient);
    mockGrpc.loadPackageDefinition.mockReturnValue({
      agent: { AgentService: mockAgentService },
    });

    // Import fresh modules
    const agentModule = await import('../agent/init');
    const chatbotModule = await import('../chatbot/init');
    initAgent = agentModule.initAgent;
    initChatbot = chatbotModule.initChatbot;
  });

  describe('Math Agent', () => {
    it('should solve arithmetic problems', async () => {
      // Create a math agent that processes arithmetic queries
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
      await new Promise(resolve => setTimeout(resolve, 10));

      mockCall.emitData(createMockTaskPayload(addContext));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mathAgent).toHaveBeenCalledWith(addContext, expect.any(Object));
      expect(mockClient.SendResult).toHaveBeenCalled();

      const sentData = JSON.parse(mockClient.SendResult.mock.calls[0][0].data.toString('utf8'));
      expect(sentData).toMatchObject({
        eventType: 'QUERY_COMPLETED',
        data: { result: 10, operation: 'add', numbers: [1, 2, 3, 4] },
      });
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
      await new Promise(resolve => setTimeout(resolve, 10));

      mockCall.emitData(createMockTaskPayload(invalidContext));
      await new Promise(resolve => setTimeout(resolve, 10));

      const sentData = JSON.parse(mockClient.SendResult.mock.calls[0][0].data.toString('utf8'));
      expect(sentData).toMatchObject({
        eventType: 'QUERY_FAILED',
        data: 'Unsupported operation: divide',
      });
    });
  });

  describe('Greeting Chatbot', () => {
    it('should respond to user greetings', async () => {
      // Create a greeting chatbot
      const greetingChatbot: ChatbotHandler = vi.fn(async (context, events) => {
        const lastMessage = context.messages[context.messages.length - 1];
        const userMessage = lastMessage.content.toLowerCase();

        let response: string;
        if (userMessage.includes('hello') || userMessage.includes('hi')) {
          response = 'Hello! How can I help you today?';
        } else if (userMessage.includes('goodbye') || userMessage.includes('bye')) {
          response = 'Goodbye! Have a great day!';
        } else {
          response = "I'm sorry, I only understand greetings right now.";
        }

        await events.emitQueryCompleted({ 
          data: { response, originalMessage: lastMessage.content } 
        });
      });

      const greetingContext = createMockChatbotContext({
        messages: [
          { role: 'user', content: 'Hello there!' }
        ]
      });

      initChatbot(greetingChatbot);
      await new Promise(resolve => setTimeout(resolve, 10));

      mockCall.emitData(createMockTaskPayload(greetingContext));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(greetingChatbot).toHaveBeenCalledWith(greetingContext, expect.any(Object));

      const sentData = JSON.parse(mockClient.SendResult.mock.calls[0][0].data.toString('utf8'));
      expect(sentData).toMatchObject({
        eventType: 'QUERY_COMPLETED',
        data: { 
          response: 'Hello! How can I help you today?',
          originalMessage: 'Hello there!'
        },
      });
    });

    it('should handle conversation context', async () => {
      const contextAwareChatbot: ChatbotHandler = vi.fn(async (context, events) => {
        const messageCount = context.messages.length;
        const lastMessage = context.messages[messageCount - 1];

        await events.emitQueryCompleted({ 
          data: { 
            messageCount,
            lastMessage: lastMessage.content,
            conversationId: context.chatbotId 
          } 
        });
      });

      const conversationContext = createMockChatbotContext({
        chatbotId: 'conversation-123',
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello!' },
          { role: 'user', content: 'How are you?' }
        ]
      });

      initChatbot(contextAwareChatbot);
      await new Promise(resolve => setTimeout(resolve, 10));

      mockCall.emitData(createMockTaskPayload(conversationContext));
      await new Promise(resolve => setTimeout(resolve, 10));

      const sentData = JSON.parse(mockClient.SendResult.mock.calls[0][0].data.toString('utf8'));
      expect(sentData).toMatchObject({
        eventType: 'QUERY_COMPLETED',
        data: { 
          messageCount: 3,
          lastMessage: 'How are you?',
          conversationId: 'conversation-123'
        },
      });
    });
  });

  describe('Data Processing Agent', () => {
    it('should process and transform data', async () => {
      // Agent that processes arrays of data
      const dataAgent: AgentHandler = vi.fn(async (context, events) => {
        const { data, operation } = context.params;

        let result: any;
        switch (operation) {
          case 'sum':
            result = data.reduce((sum: number, item: any) => sum + item.value, 0);
            break;
          case 'filter':
            result = data.filter((item: any) => item.active === true);
            break;
          case 'transform':
            result = data.map((item: any) => ({ ...item, processed: true }));
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }

        await events.emitQueryCompleted({ data: { result, operation } });
      });

      const testData = [
        { id: 1, value: 10, active: true },
        { id: 2, value: 20, active: false },
        { id: 3, value: 30, active: true }
      ];

      // Test sum operation
      const sumContext = createMockAgentContext({
        params: { data: testData, operation: 'sum' }
      });

      initAgent(dataAgent);
      await new Promise(resolve => setTimeout(resolve, 10));

      mockCall.emitData(createMockTaskPayload(sumContext));
      await new Promise(resolve => setTimeout(resolve, 10));

      let sentData = JSON.parse(mockClient.SendResult.mock.calls[0][0].data.toString('utf8'));
      expect(sentData.data.result).toBe(60); // 10 + 20 + 30

      // Reset and test filter operation  
      mockClient.SendResult.mockClear();
      const filterContext = createMockAgentContext({
        params: { data: testData, operation: 'filter' }
      });

      mockCall.emitData(createMockTaskPayload(filterContext));
      await new Promise(resolve => setTimeout(resolve, 10));

      sentData = JSON.parse(mockClient.SendResult.mock.calls[0][0].data.toString('utf8'));
      expect(sentData.data.result).toHaveLength(2); // Only active items
      expect(sentData.data.result[0].id).toBe(1);
      expect(sentData.data.result[1].id).toBe(3);
    });
  });

  describe('Event Logging Agent', () => {
    it('should emit multiple events during processing', async () => {
      const eventAgent: AgentHandler = vi.fn(async (context, events) => {
        // Emit creation event
        await events.emitQueryCreated({ data: 'Processing started' });

        // Simulate some processing
        await new Promise(resolve => setTimeout(resolve, 5));

        // Emit custom event
        await events.emitEventCreated({ 
          data: { 
            type: 'processing',
            step: 'validation',
            timestamp: Date.now() 
          } 
        });

        // Complete processing
        await events.emitQueryCompleted({ data: 'Processing finished' });
      });

      const context = createMockAgentContext({ agentId: 'event-logger' });

      initAgent(eventAgent);
      await new Promise(resolve => setTimeout(resolve, 10));

      mockCall.emitData(createMockTaskPayload(context));
      await new Promise(resolve => setTimeout(resolve, 20));

      // Should have 3 SendResult calls (created, event, completed)
      expect(mockClient.SendResult).toHaveBeenCalledTimes(3);

      const calls = mockClient.SendResult.mock.calls;
      const [createdCall, eventCall, completedCall] = calls.map(
        call => JSON.parse(call[0].data.toString('utf8'))
      );

      expect(createdCall.eventType).toBe('QUERY_CREATED');
      expect(createdCall.data).toBe('Processing started');

      expect(eventCall.eventType).toBe('EVENT_CREATED');
      expect(eventCall.data.type).toBe('processing');

      expect(completedCall.eventType).toBe('QUERY_COMPLETED');
      expect(completedCall.data).toBe('Processing finished');
    });
  });
});

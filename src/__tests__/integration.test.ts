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

// Mock the dependencies before importing the modules under test
vi.mock('@grpc/grpc-js', () => mockGrpc);
vi.mock('@grpc/proto-loader', () => mockProtoLoader);
vi.mock('path', () => ({
  default: {
    join: vi.fn(() => '/mock/path/agent.proto'),
  },
  join: vi.fn(() => '/mock/path/agent.proto'),
}));

describe('Integration Tests', () => {
  let mockClient: ReturnType<typeof createMockGrpcClient>;
  let mockCall: MockGrpcClientReadableStream;

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
  });

  describe('Agent and Chatbot Integration', () => {
    it('should work with both agent and chatbot using same mock infrastructure', async () => {
      // Create separate mock clients for each module
      const agentMockClient = createMockGrpcClient();
      const chatbotMockClient = createMockGrpcClient();
      
      const agentMockCall = agentMockClient.TaskStream() as MockGrpcClientReadableStream;
      const chatbotMockCall = chatbotMockClient.TaskStream() as MockGrpcClientReadableStream;

      // Mock separate service constructors
      const mockAgentService = vi.fn()
        .mockReturnValueOnce(agentMockClient)  // First call for agent
        .mockReturnValueOnce(chatbotMockClient); // Second call for chatbot

      mockGrpc.loadPackageDefinition.mockReturnValue({
        agent: { AgentService: mockAgentService },
      });

      // Import modules
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

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 20));

      // Send tasks to both (using respective mock calls)
      const agentContext = createMockAgentContext({ agentId: 'agent-1' });
      const chatbotContext = createMockChatbotContext({ chatbotId: 'chatbot-1' });

      agentMockCall.emitData(createMockTaskPayload(agentContext));
      chatbotMockCall.emitData(createMockTaskPayload(chatbotContext));

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 20));

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

      // Verify results were collected (each should have been called once)
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

      // Verify SendResult was called for both completions (once each)
      expect(agentMockClient.SendResult).toHaveBeenCalledTimes(1);
      expect(chatbotMockClient.SendResult).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in both agent and chatbot', async () => {
      // Create separate mock clients
      const agentMockClient = createMockGrpcClient();
      const chatbotMockClient = createMockGrpcClient();
      
      const agentMockCall = agentMockClient.TaskStream() as MockGrpcClientReadableStream;
      const chatbotMockCall = chatbotMockClient.TaskStream() as MockGrpcClientReadableStream;

      const mockAgentService = vi.fn()
        .mockReturnValueOnce(agentMockClient)
        .mockReturnValueOnce(chatbotMockClient);

      mockGrpc.loadPackageDefinition.mockReturnValue({
        agent: { AgentService: mockAgentService },
      });

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

      await new Promise(resolve => setTimeout(resolve, 20));

      // Send tasks that will cause errors
      agentMockCall.emitData(createMockTaskPayload(createMockAgentContext()));
      chatbotMockCall.emitData(createMockTaskPayload(createMockChatbotContext()));

      await new Promise(resolve => setTimeout(resolve, 20));

      // Verify both errors were handled and emitQueryFailed was called
      expect(agentMockClient.SendResult).toHaveBeenCalledTimes(1);
      expect(chatbotMockClient.SendResult).toHaveBeenCalledTimes(1);
      
      const agentCalls = agentMockClient.SendResult.mock.calls;
      const chatbotCalls = chatbotMockClient.SendResult.mock.calls;
      
      const agentSentData = JSON.parse(agentCalls[0][0].data.toString('utf8'));
      const chatbotSentData = JSON.parse(chatbotCalls[0][0].data.toString('utf8'));

      expect(agentSentData).toMatchObject({
        eventType: 'QUERY_FAILED',
        webhookListener: 'emitQueryFailed',
        data: 'Agent error',
      });

      expect(chatbotSentData).toMatchObject({
        eventType: 'QUERY_FAILED',
        webhookListener: 'emitQueryFailed',
        data: 'Chatbot error',
      });
    });
  });

  describe('Mock Utilities', () => {
    it('should provide comprehensive mock functionality', () => {
      // Test mock client creation
      const client = createMockGrpcClient();
      expect(client.SendResult).toBeDefined();
      expect(client.TaskStream).toBeDefined();
      expect(client.waitForReady).toBeDefined();
      expect(client.close).toBeDefined();

      // Test mock call functionality
      const call = client.TaskStream();
      expect(call).toBeInstanceOf(MockGrpcClientReadableStream);
      expect(call.cancel).toBeDefined();
      expect(call.emitData).toBeDefined();
      expect(call.emitError).toBeDefined();
      expect(call.emitEnd).toBeDefined();
      expect(call.emitClose).toBeDefined();
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

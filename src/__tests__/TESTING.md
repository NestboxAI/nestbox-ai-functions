# Testing Guide for Nestbox AI Agent

This guide explains how to test agent and chatbot logic using the provided mock utilities.

## Test Setup

The project uses Vitest for testing with comprehensive mock utilities for gRPC clients and related dependencies.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test -- --watch

# Run tests with coverage
npm run coverage

# Run tests with UI
npm run test -- --ui
```

## Mock Utilities

### Location
All mock utilities are located in `src/__mocks__/grpc-client.ts` and can be reused across tests.

### Available Mocks

#### `createMockGrpcClient()`
Creates a mock gRPC client with all necessary methods:
- `SendResult` - Mocked to simulate successful responses
- `TaskStream` - Returns a mock readable stream
- `waitForReady` - Simulates ready state
- `close` - Mock cleanup method

#### `MockGrpcClientReadableStream`
Extends EventEmitter to simulate gRPC streams with helper methods:
- `emitData(data)` - Simulate receiving data
- `emitError(error)` - Simulate stream errors
- `emitEnd()` - Simulate stream end
- `emitClose()` - Simulate stream close

#### Context Helpers

##### `createMockAgentContext(overrides?)`
Creates a mock agent context with sensible defaults:
```typescript
{
  queryId: 'test-query-id',
  agentId: 'test-agent-id', 
  agentName: 'test-agent',
  webhookGroups: ['test-group'],
  params: { test: 'data' }
}
```

##### `createMockChatbotContext(overrides?)`
Creates a mock chatbot context:
```typescript
{
  queryId: 'test-query-id',
  chatbotId: 'test-chatbot-id',
  chatbotName: 'test-chatbot', 
  webhookGroups: ['test-group'],
  params: { test: 'data' },
  messages: [{ role: 'user', content: 'test message' }]
}
```

##### `createMockTaskPayload(context)`
Creates a proper task payload with Buffer encoding.

## Example Tests

### Testing an Agent

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  createMockGrpcClient,
  createMockAgentContext,
  createMockTaskPayload,
  mockGrpc,
  mockProtoLoader 
} from '../../__mocks__/grpc-client';
import type { AgentHandler } from '../../types/agent/handler';

// Mock dependencies
vi.mock('@grpc/grpc-js', () => mockGrpc);
vi.mock('@grpc/proto-loader', () => mockProtoLoader);
vi.mock('path', () => ({
  join: vi.fn(() => '/mock/path/agent.proto'),
}));

describe('My Agent', () => {
  let mockClient: ReturnType<typeof createMockGrpcClient>;
  let initAgent: (agent: AgentHandler) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockGrpcClient();
    
    // Setup mock proto
    const mockAgentService = vi.fn(() => mockClient);
    mockGrpc.loadPackageDefinition.mockReturnValue({
      agent: { AgentService: mockAgentService },
    });

    // Import fresh module
    vi.resetModules();
    const module = await import('../../agent/init');
    initAgent = module.initAgent;
  });

  it('should process tasks correctly', async () => {
    const myAgent: AgentHandler = vi.fn(async (context, events) => {
      // Your agent logic here
      await events.emitQueryCompleted({ data: 'success' });
    });

    const context = createMockAgentContext({ agentId: 'my-agent' });
    const payload = createMockTaskPayload(context);

    initAgent(myAgent);
    await new Promise(resolve => setTimeout(resolve, 10));

    // Simulate task
    const mockCall = mockClient.TaskStream();
    mockCall.emitData(payload);
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify agent was called
    expect(myAgent).toHaveBeenCalledWith(context, expect.any(Object));
    
    // Verify event was emitted
    expect(mockClient.SendResult).toHaveBeenCalled();
  });
});
```

### Testing a Chatbot

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  createMockGrpcClient,
  createMockChatbotContext,
  createMockTaskPayload,
  mockGrpc,
  mockProtoLoader 
} from '../../__mocks__/grpc-client';
import type { ChatbotHandler } from '../../types/chatbot/handler';

// Mock dependencies  
vi.mock('@grpc/grpc-js', () => mockGrpc);
vi.mock('@grpc/proto-loader', () => mockProtoLoader);
vi.mock('path', () => ({
  join: vi.fn(() => '/mock/path/agent.proto'),
}));

describe('My Chatbot', () => {
  let mockClient: ReturnType<typeof createMockGrpcClient>;
  let initChatbot: (chatbot: ChatbotHandler) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockGrpcClient();
    
    const mockAgentService = vi.fn(() => mockClient);
    mockGrpc.loadPackageDefinition.mockReturnValue({
      agent: { AgentService: mockAgentService },
    });

    vi.resetModules();
    const module = await import('../../chatbot/init');
    initChatbot = module.initChatbot;
  });

  it('should handle messages correctly', async () => {
    const myChatbot: ChatbotHandler = vi.fn(async (context, events) => {
      // Process the messages
      const lastMessage = context.messages[context.messages.length - 1];
      await events.emitQueryCompleted({ 
        data: `Response to: ${lastMessage.content}` 
      });
    });

    const context = createMockChatbotContext({
      messages: [{ role: 'user', content: 'Hello!' }]
    });
    const payload = createMockTaskPayload(context);

    initChatbot(myChatbot);
    await new Promise(resolve => setTimeout(resolve, 10));

    const mockCall = mockClient.TaskStream();
    mockCall.emitData(payload);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(myChatbot).toHaveBeenCalledWith(context, expect.any(Object));
    expect(mockClient.SendResult).toHaveBeenCalled();
  });
});
```

## Testing Best Practices

1. **Use `vi.resetModules()`** before importing to ensure fresh instances
2. **Mock dependencies** before importing the modules under test
3. **Use async/await** with timeouts for gRPC stream operations
4. **Clear mocks** between tests with `vi.clearAllMocks()`
5. **Test error scenarios** by making mocks throw errors
6. **Verify payloads** by checking `SendResult` call arguments
7. **Use custom contexts** with the `overrides` parameter for specific test cases

## Common Test Patterns

### Testing Event Emission
```typescript
// Capture events for testing
let capturedEvents: AgentEvents | null = null;
const testAgent: AgentHandler = vi.fn((context, events) => {
  capturedEvents = events;
});

// Later in test...
if (capturedEvents) {
  await capturedEvents.emitQueryCompleted({ data: 'test' });
  // Verify SendResult was called with correct payload
}
```

### Testing Error Handling
```typescript
const errorAgent: AgentHandler = vi.fn(() => {
  throw new Error('Test error');
});

// Verify error results in emitQueryFailed call
expect(mockClient.SendResult).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.any(Buffer),
  }),
  expect.any(Function)
);

const sentData = JSON.parse(callArgs[0].data.toString('utf8'));
expect(sentData).toMatchObject({
  eventType: 'QUERY_FAILED',
  data: 'Test error',
});
```

### Testing Connection Issues
```typescript
// Mock connection failure
mockClient.waitForReady.mockImplementationOnce((deadline, callback) => {
  setTimeout(() => callback(new Error('Connection failed')), 0);
});

// Verify reconnection logic
await new Promise(resolve => setTimeout(resolve, 1100));
expect(mockClient.waitForReady).toHaveBeenCalledTimes(2);
```

This testing setup provides comprehensive coverage for both agent and chatbot logic while maintaining good separation of concerns and reusability.

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


# Nestbox AI Agent Testing Suite

This testing suite provides comprehensive coverage for both agent and chatbot logic in the Nestbox AI platform, with reusable mock utilities that can be used across different test scenarios.

## 📋 Test Coverage Summary

### ✅ What's Tested

#### Core Infrastructure Tests
- **Agent Initialization** (`src/agent/__tests__/init.test.ts`)
  - Connection establishment and gRPC stream setup
  - Task reception and handler execution
  - Event emission (queryCreated, queryCompleted, queryFailed, eventCreated)
  - Error handling and automatic retry logic
  - Stream disconnection and reconnection
  - Process cleanup and signal handling

- **Chatbot Initialization** (`src/chatbot/__tests__/init.test.ts`)
  - Same infrastructure tests as agent but for chatbot context
  - Chatbot-specific context handling (messages, chatbotId)
  - Verification of correct method usage (SendResult vs SendMessage)

- **Agent Utilities** (`src/agent/__tests__/useAgent.test.ts`)
  - `useAgent` function behavior and passthrough functionality

#### Integration Tests (`src/__tests__/integration.test.ts`)
- Cross-module compatibility between agent and chatbot
- Shared mock infrastructure usage
- Error propagation in multi-module scenarios
- Mock utility functionality verification

#### Example Use Cases (`src/__tests__/examples.test.ts`)
- **Math Agent**: Arithmetic operations with error handling
- **Greeting Chatbot**: Message processing and response generation
- **Data Processing Agent**: Array manipulation and transformation
- **Event Logging Agent**: Multiple event emission patterns

### 🛠️ Mock Infrastructure

#### Reusable Mock Components (`src/__mocks__/grpc-client.ts`)

1. **`createMockGrpcClient()`**
   - Simulates gRPC client with all necessary methods
   - Configurable response behavior
   - Automatic success responses by default

2. **`MockGrpcClientReadableStream`**
   - Event-driven stream simulation
   - Helper methods for data emission, errors, and disconnection
   - Full EventEmitter compatibility

3. **Context Helpers**
   - `createMockAgentContext()` - Agent-specific context generation
   - `createMockChatbotContext()` - Chatbot-specific context with messages
   - `createMockTaskPayload()` - Proper Buffer encoding for tasks

#### Mock Features
- ✅ Configurable success/failure responses
- ✅ Stream simulation with event emission
- ✅ Connection retry and error scenarios
- ✅ Proper TypeScript typing
- ✅ Vitest integration with `vi.fn()` mocks

## 🚀 Getting Started

### 1. Run Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test src/agent/__tests__/init.test.ts

# Run with coverage
npm run coverage

# Run with UI
npm test -- --ui
```

### 2. Create Your Own Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockGrpcClient,
  createMockAgentContext,
  createMockTaskPayload,
  mockGrpc,
  mockProtoLoader,
} from '../__mocks__/grpc-client';
import type { AgentHandler } from '../types/agent/handler';

// Mock dependencies
vi.mock('@grpc/grpc-js', () => mockGrpc);
vi.mock('@grpc/proto-loader', () => mockProtoLoader);
vi.mock('path', () => ({
  default: { join: vi.fn(() => '/mock/path/agent.proto') },
  join: vi.fn(() => '/mock/path/agent.proto'),
}));

describe('My Custom Agent', () => {
  let mockClient: ReturnType<typeof createMockGrpcClient>;
  let initAgent: (agent: AgentHandler) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    
    mockClient = createMockGrpcClient();
    const mockAgentService = vi.fn(() => mockClient);
    mockGrpc.loadPackageDefinition.mockReturnValue({
      agent: { AgentService: mockAgentService },
    });

    const module = await import('../agent/init');
    initAgent = module.initAgent;
  });

  it('should process custom logic', async () => {
    const myAgent: AgentHandler = vi.fn(async (context, events) => {
      // Your agent logic here
      await events.emitQueryCompleted({ data: 'success' });
    });

    const context = createMockAgentContext({ 
      params: { custom: 'data' } 
    });

    initAgent(myAgent);
    await new Promise(resolve => setTimeout(resolve, 10));

    const mockCall = mockClient.TaskStream();
    mockCall.emitData(createMockTaskPayload(context));
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(myAgent).toHaveBeenCalledWith(context, expect.any(Object));
    expect(mockClient.SendResult).toHaveBeenCalled();
  });
});
```

## 📊 Test Metrics

- **Total Test Files**: 5
- **Total Tests**: 30
- **Test Categories**:
  - Infrastructure Tests: 18
  - Integration Tests: 5
  - Utility Tests: 3
  - Example/Demo Tests: 6

## 🎯 Key Testing Patterns

### 1. Event Verification
```typescript
// Verify event emission
const sentData = JSON.parse(mockClient.SendResult.mock.calls[0][0].data.toString('utf8'));
expect(sentData).toMatchObject({
  eventType: 'QUERY_COMPLETED',
  data: expectedData,
});
```

### 2. Error Handling
```typescript
const errorAgent: AgentHandler = vi.fn(() => {
  throw new Error('Test error');
});

// Verify error results in QUERY_FAILED event
expect(sentData.eventType).toBe('QUERY_FAILED');
expect(sentData.data).toBe('Test error');
```

### 3. Stream Simulation
```typescript
// Simulate connection issues
mockClient.waitForReady.mockImplementationOnce((deadline, callback) => {
  setTimeout(() => callback(new Error('Connection failed')), 0);
});

// Simulate stream disconnection
mockCall.emitError(new Error('Stream error'));
```

### 4. Context Customization
```typescript
// Custom agent context
const context = createMockAgentContext({
  agentId: 'my-custom-agent',
  params: { operation: 'process', data: [1, 2, 3] }
});

// Custom chatbot context  
const context = createMockChatbotContext({
  messages: [
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there!' }
  ]
});
```

## 📚 Additional Resources

- **Testing Guide**: `TESTING.md` - Comprehensive testing documentation
- **Mock Utilities**: `src/__mocks__/grpc-client.ts` - Reusable test infrastructure
- **Example Tests**: `src/__tests__/examples.test.ts` - Real-world usage patterns
- **Type Definitions**: `src/types/` - Agent and chatbot interfaces

## 🔧 Configuration

### Vitest Config (`vitest.config.ts`)
- Node environment for gRPC compatibility
- Global test utilities
- Setup file for common mocks

### Setup File (`vitest.setup.ts`)
- Mock process.argv for agent ID
- Console method mocking for clean test output

This testing suite ensures robust validation of agent and chatbot logic while providing developers with the tools needed to test their custom implementations effectively.

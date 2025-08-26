import { EventEmitter } from 'events';
import { vi } from 'vitest';

export interface MockGrpcCall extends EventEmitter {
  cancel: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

export interface MockGrpcClient {
  SendResult: ReturnType<typeof vi.fn>;
  TaskStream: ReturnType<typeof vi.fn>;
  waitForReady: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

export class MockGrpcClientReadableStream extends EventEmitter implements MockGrpcCall {
  public cancel = vi.fn();
  public write = vi.fn();
  public end = vi.fn();

  constructor() {
    super();
  }

  // Helper method to simulate receiving data
  emitData(data: any) {
    this.emit('data', data);
  }

  // Helper method to simulate errors
  emitError(error: any) {
    this.emit('error', error);
  }

  // Helper method to simulate stream end
  emitEnd() {
    this.emit('end');
  }

  // Helper method to simulate stream close
  emitClose() {
    this.emit('close');
  }
}

export function createMockGrpcClient(): MockGrpcClient {
  const mockCall = new MockGrpcClientReadableStream();
  
  return {
    SendResult: vi.fn((message: any, callback: any) => {
      // Simulate successful response by default
      setTimeout(() => callback(null, { success: true }), 0);
    }),
    TaskStream: vi.fn(() => mockCall),
    waitForReady: vi.fn((deadline: any, callback: any) => {
      // Simulate ready state by default
      setTimeout(() => callback(), 0);
    }),
    close: vi.fn(),
  };
}

// Mock the grpc module
export const mockGrpcCredentials = {
  createInsecure: vi.fn(),
};

export const mockGrpc = {
  credentials: mockGrpcCredentials,
  loadPackageDefinition: vi.fn(),
};

// Mock the proto loader
export const mockProtoLoader = {
  loadSync: vi.fn(() => ({})),
};

// Helper to create a mock task payload
export function createMockTaskPayload(context: any) {
  return {
    payload: Buffer.from(JSON.stringify(context)),
  };
}

// Helper to create a mock agent context
export function createMockAgentContext(overrides: Partial<any> = {}) {
  return {
    queryId: 'test-query-id',
    agentId: 'test-agent-id',
    agentName: 'test-agent',
    webhookGroups: ['test-group'],
    params: { test: 'data' },
    ...overrides,
  };
}

// Helper to create a mock chatbot context
export function createMockChatbotContext(overrides: Partial<any> = {}) {
  return {
    queryId: 'test-query-id',
    chatbotId: 'test-chatbot-id',
    chatbotName: 'test-chatbot',
    webhookGroups: ['test-group'],
    params: { test: 'data' },
    messages: [{ role: 'user', content: 'test message' }],
    ...overrides,
  };
}

export { MockGrpcClientReadableStream as MockCall };

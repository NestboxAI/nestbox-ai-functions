import { vi } from 'vitest'
import { MockStreamManager } from './src/__mocks__/grpc-client'

// Mock process.argv to prevent issues during testing
process.argv = ['node', 'test', 'test-agent-id']

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

// Mock the common modules
vi.mock('./src/common/stream-manager', () => ({
  StreamManager: MockStreamManager,
}))

vi.mock('./src/common/grpc-client', () => ({
  getClient: vi.fn(),
  closeClient: vi.fn(),
  waitForServerReady: vi.fn(() => Promise.resolve()),
}))

vi.mock('./src/common/event-configs', () => ({
  EVENT_CONFIGS: {
    queryCreated: {
      eventType: "QUERY_CREATED",
      webhookListener: "emitQueryCreated",
    },
    queryCompleted: {
      eventType: "QUERY_COMPLETED",
      webhookListener: "emitQueryCompleted",
    },
    queryFailed: {
      eventType: "QUERY_FAILED",
      webhookListener: "emitQueryFailed",
    },
    eventCreated: {
      eventType: "EVENT_CREATED",
      webhookListener: "emitEventCreated",
    },
  },
}))

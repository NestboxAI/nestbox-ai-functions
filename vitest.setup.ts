import { vi } from 'vitest'

// Mock process.argv to prevent issues during testing
process.argv = ['node', 'test', 'test-agent-id']

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

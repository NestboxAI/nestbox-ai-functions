import { vi } from 'vitest';
import { createMockGrpcClient } from '../grpc-client';

// Mock the gRPC client functions
export const getClient = vi.fn(() => createMockGrpcClient());
export const closeClient = vi.fn();
export const waitForServerReady = vi.fn(() => Promise.resolve());

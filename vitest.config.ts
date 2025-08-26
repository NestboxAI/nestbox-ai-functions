import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 10000, // 10 second timeout for CI
    hookTimeout: 5000,  // 5 second timeout for hooks
    silent: process.env.CI === 'true', // Reduce output in CI
  },
})

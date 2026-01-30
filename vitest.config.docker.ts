import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/docker/**/*.test.ts'],
    testTimeout: 180000,
    hookTimeout: 30000
  }
})

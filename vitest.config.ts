import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Exclude tests that require external dependencies (Docker daemon, real APIs)
    // Use npm run test:docker or npm run test:prod to run them locally
    exclude: ['tests/prod/**', 'tests/docker/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts']
    }
  }
})

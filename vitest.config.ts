import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});

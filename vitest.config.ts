import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Property-based tests (fast-check) run hundreds of cases; the default
    // 5s timeout is too tight for slower CI hardware.
    testTimeout: 20_000,
  },
});

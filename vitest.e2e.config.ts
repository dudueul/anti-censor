import { defineConfig } from 'vitest/config';

// Browser integration tests. Kept separate from the fast pure-unit suite; run
// with `npm run test:e2e`. Drives the pre-installed Chromium via Playwright.
export default defineConfig({
  test: {
    include: ['test-e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 90000,
  },
});

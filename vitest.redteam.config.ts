import { defineConfig } from 'vitest/config';

// Red-team suite: measures our transforms against independent third-party
// detector implementations (jimp, blockhash-core). Run with `npm run test:redteam`.
export default defineConfig({
  test: {
    include: ['test-redteam/**/*.redteam.ts'],
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});

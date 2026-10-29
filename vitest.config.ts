import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
          // Tests call the API directly, without Cloudflare Access in front.
          ACCESS_TEAM_DOMAIN: '',
          ACCESS_AUD: '',
        },
      },
    }),
  ],
  test: { include: ['test/**/*.test.ts'], testTimeout: 30000 },
});

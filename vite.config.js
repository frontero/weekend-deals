import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';
import { parseAffiliateLinks } from './server/affiliate.mjs';
import { weekendDealsApi } from './server/vite-plugin.mjs';

export default defineConfig(({ mode }) => {
  // Read without a VITE_ prefix, so keys and tokens stay on the server and never reach the browser.
  const env = loadEnv(mode, process.cwd(), ['GOOGLE_', 'TURSO_', 'WORKER_', 'AFFILIATE_']);

  return {
    plugins: [
      vue(),
      tailwindcss(),
      weekendDealsApi({
        env,
        googleApiKey: env.GOOGLE_PLACES_API_KEY || null,
        appUrl: env.WORKER_URL || null,
        affiliateLinks: parseAffiliateLinks(env.AFFILIATE_LINKS),
        // The smoke test runs a second server next to the app; only the app fetches prices.
        collect: process.env.WEEKEND_DEALS_COLLECT !== 'off',
      }),
    ],
    server: { port: 5288 },
    preview: { port: 5288 },
  };
});

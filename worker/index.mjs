import { createClient } from '@libsql/client/web';
import { openDatabase } from '../server/db.mjs';
import { createApiHandler } from '../server/handler.mjs';
import { parseAffiliateLinks } from '../server/affiliate.mjs';
import { isAdminEmail, verifyAccess } from './access.mjs';
import { startWorkflows } from './clock.mjs';

/**
 * The app in the cloud: the built screen from dist/, and the /api routes on Turso. GitHub fetches the prices, started
 * by this Worker's clock; a refresh here leaves a request for the next run. Only visitors that Cloudflare Access let in reach the data; the
 * admin page only those whose email address is in ADMIN_EMAILS (comma-separated).
 */
export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return new Response('Turso is not set up', { status: 503 });
    const access = await verifyAccess(request, env);
    if (!access) return new Response('Forbidden', { status: 403 });

    const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    const isAdmin = () => isAdminEmail(access.email, env.ADMIN_EMAILS);
    const options = { isAdmin, googleApiKey: env.GOOGLE_PLACES_API_KEY ?? null, affiliateLinks: parseAffiliateLinks(env.AFFILIATE_LINKS) };
    return createApiHandler(await openDatabase(client, { runMigrations: false }), options)(request);
  },

  // Every ten minutes (the cron trigger in wrangler.jsonc): start the GitHub workflows that collect prices.
  async scheduled(controller, env, context) {
    context.waitUntil(startWorkflows(env));
  },
};

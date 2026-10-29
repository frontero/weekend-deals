import { createClient } from '@libsql/client/web';
import { openDatabase } from '../server/db.mjs';
import { createApiHandler } from '../server/handler.mjs';
import { parseAffiliateLinks } from '../server/affiliate.mjs';
import { isAdminEmail, verifyAccess } from './access.mjs';
import { startWorkflows } from './clock.mjs';
import { isPagePath, servePage } from '../server/pages.mjs';

// Routes where each call costs something: a provider's or Google's quota, or a message sent. RATE_LIMITER in
// wrangler.jsonc caps them per visitor.
const LIMITED = new Set(['POST /api/quote', 'GET /api/reviews', 'POST /api/geocode', 'POST /api/alerts', 'POST /api/alerts/test']);

// The built app's stylesheet, whose name changes with every build; read once per Worker instance.
let stylesheet;
async function appStylesheet(env, request) {
  stylesheet ??= (await (await env.ASSETS.fetch(new URL('/', request.url))).text()).match(/href="([^"]+\.css)"/)?.[1] ?? null;
  return stylesheet;
}

/**
 * The app in the cloud: the built screen from dist/, and the /api routes on Turso. GitHub fetches the prices, started
 * by this Worker's clock; a refresh here leaves a request for the next run. The site is open to everyone; the admin
 * routes only to those that Cloudflare Access let in and whose email address is in ADMIN_EMAILS (comma-separated).
 */
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const page = isPagePath(pathname);
    if (!page && !pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (LIMITED.has(`${request.method} ${pathname}`)) {
      const { success } = await env.RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' });
      if (!success) return Response.json({ error: 'Too many requests' }, { status: 429 });
    }
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return new Response('Turso is not set up', { status: 503 });
    const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    const db = await openDatabase(client, { runMigrations: false });
    if (page) return servePage(db, request, { stylesheet: await appStylesheet(env, request) });

    let access;
    const isAdmin = async () => isAdminEmail((await (access ??= verifyAccess(request, env)))?.email, env.ADMIN_EMAILS);
    const options = { isAdmin, googleApiKey: env.GOOGLE_PLACES_API_KEY ?? null, affiliateLinks: parseAffiliateLinks(env.AFFILIATE_LINKS) };
    return createApiHandler(db, options)(request);
  },

  // Every ten minutes (the cron trigger in wrangler.jsonc): start the GitHub workflows that collect prices.
  async scheduled(controller, env, context) {
    context.waitUntil(startWorkflows(env));
  },
};

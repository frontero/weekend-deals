import { createClient } from '@libsql/client/web';
import { openDatabase } from '../server/db.mjs';
import { isPageView, pageViewPoint } from '../server/events.mjs';
import { clientNetwork, createApiHandler, visitorOf } from '../server/handler.mjs';
import { analyticsQuery } from '../server/traffic.mjs';
import { parseAffiliateLinks } from '../server/affiliate.mjs';
import { isAdminEmail, verifyAccess } from './access.mjs';
import { startWorkflows } from './clock.mjs';
import { isPagePath, servePage, serveUnavailable } from '../server/pages.mjs';

// Routes where each call costs something: a provider's or Google's quota, a message sent, or database rows. RATE_LIMITER
// in wrangler.jsonc caps them per visitor.
const LIMITED = new Set([
  'POST /api/quote',
  'GET /api/history',
  'GET /api/reviews',
  'POST /api/geocode',
  'GET /api/alerts',
  'POST /api/alerts',
  'DELETE /api/alerts',
  'POST /api/alerts/test',
  'POST /api/feedback',
]);
// The counts of what visitors use come in batches, apart from the routes above so they never use up their limit.
const EVENTS_ROUTE = 'POST /api/events';

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
  async fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    const page = isPagePath(pathname);
    if (!page && !pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const route = `${request.method} ${pathname}`;
    const limiter = route === EVENTS_ROUTE ? env.EVENT_LIMITER : LIMITED.has(route) ? env.RATE_LIMITER : null;
    if (limiter) {
      const { success } = await limiter.limit({ key: clientNetwork(request.headers.get('CF-Connecting-IP')) ?? 'unknown' });
      if (!success) return Response.json({ error: 'Too many requests' }, { status: 429 });
    }
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return new Response('Turso is not set up', { status: 503 });
    const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    const db = await openDatabase(client, { runMigrations: false });
    // A failed count must never cost a visitor their page.
    const recordEvent = env.EVENTS
      ? (point) => {
          try {
            env.EVENTS.writeDataPoint(point);
          } catch (error) {
            console.error(error);
          }
        }
      : null;
    try {
      if (page) {
        const response = await servePage(db, request, { stylesheet: await appStylesheet(env, request) });
        if (recordEvent && response.ok && isPageView(request)) {
          context.waitUntil(visitorOf(db, request).catch(() => null).then((visitor) => recordEvent(pageViewPoint(request, visitor))));
        }
        return response;
      }

      let access;
      const isAdmin = async () => isAdminEmail((await (access ??= verifyAccess(request, env)))?.email, env.ADMIN_EMAILS);
      const queryEvents = env.ANALYTICS_READ_TOKEN
        ? analyticsQuery({ accountId: env.CLOUDFLARE_ACCOUNT_ID, token: env.ANALYTICS_READ_TOKEN })
        : null;
      const options = {
        isAdmin,
        googleApiKey: env.GOOGLE_PLACES_API_KEY ?? null,
        affiliateLinks: parseAffiliateLinks(env.AFFILIATE_LINKS),
        recordEvent,
        queryEvents,
      };
      return await createApiHandler(db, options)(request);
    } catch (error) {
      // Turso blocks the database for the rest of the month once a free limit is reached: a short page, not a crash.
      console.error(error);
      if (page) return serveUnavailable(request, { stylesheet: await appStylesheet(env, request) });
      return Response.json({ error: 'Database unavailable' }, { status: 503 });
    }
  },

  // Every ten minutes (the cron trigger in wrangler.jsonc): start the GitHub workflows that collect prices.
  async scheduled(controller, env, context) {
    context.waitUntil(startWorkflows(env));
  },
};

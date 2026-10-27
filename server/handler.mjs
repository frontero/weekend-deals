import { groupKey as partyKey, PARTY_FIELDS, partyOf, seriesFor } from '../shared/party.mjs';
import { cleanSearch, sendNotification, TOPIC_PATTERN } from './alerts.mjs';
import { geocode } from './geocode.mjs';
import { adminWindowStart } from '../shared/admin-stats.mjs';
import { SHOWN_ROUNDS } from '../shared/scan-changes.mjs';
import { fetchPlaceReviews, MONTHLY_GOOGLE_BUDGET, MONTHLY_REVIEW_BUDGET, REVIEW_COUNTER } from './google.mjs';
import { WATCH_STATS_KEY } from '../shared/watch.mjs';
import { clampSettings, groupKey } from './settings.mjs';
import { PROVIDERS } from './providers.mjs';
import { scanStatus, statusBody } from './status.mjs';

const JSON_TYPE = 'application/json; charset=utf-8';
// Group keys are short; anything longer is not one.
const MAX_KEY_LENGTH = 300;
const MAX_ALERTS_PER_TOPIC = 20;
const MAX_SEEN_DEALS = 1000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
// A live quote is for a short stay; longer ones are no weekend.
const MAX_QUOTE_NIGHTS = 7;

const validTopic = (topic) => typeof topic === 'string' && TOPIC_PATTERN.test(topic);
const publicAlert = ({ id, partyKey, party, label, createdAt }) => ({ id, partyKey, party, label, createdAt });

/** The deals an alert matched when it was set: plain { parkCode, arrival, priceCents } rows. */
const seenDeals = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) => typeof row?.parkCode === 'string' && typeof row?.arrival === 'string' && Number.isFinite(row?.priceCents))
    .slice(0, MAX_SEEN_DEALS)
    .map(({ parkCode, arrival, priceCents }) => ({ parkCode, arrival, priceCents }));

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': JSON_TYPE } });
// JSON that Turso already put together, passed on as it is.
const jsonText = (text) => new Response(text, { headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': 'no-store' } });

/**
 * The /api routes as a fetch handler, shared by the Mac (behind Vite) and the cloud app (a Cloudflare Worker).
 * The list's prices come per party size, ready ahead of time; requests name the size with `?party=<group key>`.
 * A viewer's exact party is priced live per park and weekend: POST /quote.
 * Only the Mac collects prices: it passes its collector's hooks; the cloud app leaves the work for it.
 * @param live returns the progress of a round running in this process, if any
 * @param onScanRequested looks for a round to run right away, where that is possible
 * @param isAdmin whether the request comes from someone who may see the admin page
 * @param googleApiKey for the Google reviews of a park; without it they link to Google Maps only
 */
export function createApiHandler(db, { live = () => null, onScanRequested = () => {}, isAdmin = () => false, googleApiKey = null } = {}) {
  /** The party size the screen shows, as `?party=` names it. */
  async function partiesOf(request) {
    const key = new URL(request.url).searchParams.get('party');
    return [key && key.length <= MAX_KEY_LENGTH ? key : groupKey(seriesFor(await db.getSettings()))];
  }

  /** Admin routes answer admins only. */
  const forAdmins = (route) => async (request) =>
    (await isAdmin(request)) ? route(request) : json({ error: 'Forbidden' }, 403);

  const status = async (request) => ({
    ...statusBody(await db.statusInputs(), { live: live(), parties: await partiesOf(request) }),
    admin: await isAdmin(request),
  });

  /** @param parties group keys of the sizes to collect; none means all of them */
  async function requestScan(parties = []) {
    await db.requestScan({ parties });
    onScanRequested();
  }

  const routes = {
    'GET /status': async (request) => json(await status(request)),

    // Gzipped once per round, and passed on without unpacking: the cloud app has little CPU time per request.
    'GET /overview': async (request) => {
      const [key] = await partiesOf(request);
      const parks = await db.overviewParks(key);
      if (!parks) return json([]);
      return new Response(parks, {
        headers: { 'Content-Type': JSON_TYPE, 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' },
        encodeBody: 'manual',
      });
    },

    'GET /history': async (request) => {
      const params = new URL(request.url).searchParams;
      const [key] = await partiesOf(request);
      return json(await db.priceHistory(key, params.get('park') ?? '', params.get('arrival') ?? ''));
    },

    // A park's Google reviews, asked for live: Google's terms do not allow keeping them.
    'GET /reviews': async (request) => {
      const placeId = await db.googlePlaceId(new URL(request.url).searchParams.get('park') ?? '');
      if (!placeId) return json({ error: 'No Google place for this park' }, 404);
      if (!googleApiKey) return json({ error: 'Google is not set up' }, 503);
      const month = new Date().toISOString().slice(0, 7);
      if ((await db.googleRequests(month, REVIEW_COUNTER)) >= MONTHLY_REVIEW_BUDGET) return json({ error: 'Monthly budget used' }, 429);
      await db.countGoogleRequest(month, REVIEW_COUNTER);
      return json(await fetchPlaceReviews(placeId, googleApiKey));
    },

    // POST keeps the home address out of URLs and request logs.
    'POST /geocode': async (request) => {
      const query = String((await readJson(request)).query ?? '').trim();
      return json(query ? await geocode(query) : []);
    },

    // When the rounds ran and what they changed; for admins only.
    'GET /admin': forAdmins(async () => {
      const { settings, collector, scanRequestedAt } = await db.statusInputs();
      const month = new Date().toISOString().slice(0, 7);
      const history = await db.rounds(SHOWN_ROUNDS);
      // What the screen needs to link each change to the accommodation's page, or else the park's.
      const moves = history.flatMap((round) => round.changes?.biggest ?? []);
      const moved = new Set(moves.map((move) => move.parkCode));
      const parks = Object.fromEntries(
        [...(await db.parks()).values()]
          .filter((park) => moved.has(park.code))
          .map(({ code, provider, url, pricesUrl }) => [code, { code, provider, url, pricesUrl, accommodations: {} }]),
      );
      const pairs = new Map(
        moves.filter((move) => move.accommodationCode).map((move) => [`${move.parkCode}|${move.accommodationCode}`, [move.parkCode, move.accommodationCode]]),
      );
      for (const { parkCode, code, url } of await db.accommodationPages([...pairs.values()])) {
        if (parks[parkCode]) parks[parkCode].accommodations[code] = { url };
      }
      return json({
        rounds: settings.rounds,
        scan: scanStatus({ collector, scanRequestedAt, live: live() }),
        providerErrors: await db.providerErrors(),
        google: { used: await db.googleRequests(month), budget: MONTHLY_GOOGLE_BUDGET, error: await db.googleError() },
        history,
        parks,
        totals: await db.adminTotals(),
      });
    }),

    // The charts of a party size, computed after each round and passed on still gzipped, like the park list.
    'GET /admin/stats': forAdmins(async (request) => {
      const [key] = await partiesOf(request);
      const data = await db.adminStats(key);
      if (!data) return json({ error: 'Not computed yet' }, 404);
      return new Response(data, {
        headers: { 'Content-Type': JSON_TYPE, 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' },
        encodeBody: 'manual',
      });
    }),

    // When providers change their prices, from the price watch; computed after each watch run.
    'GET /admin/watch': forAdmins(async () => {
      const data = await db.adminStats(WATCH_STATS_KEY);
      if (!data) return json({ error: 'Not computed yet' }, 404);
      return new Response(data, {
        headers: { 'Content-Type': JSON_TYPE, 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' },
        encodeBody: 'manual',
      });
    }),

    // One park's prices per round and weekend for a party size.
    'GET /admin/park': forAdmins(async (request) => {
      const [key] = await partiesOf(request);
      const code = new URL(request.url).searchParams.get('code') ?? '';
      const history = await db.parkHistory(code, key, adminWindowStart());
      if (!history.park) return json({ error: 'Unknown park' }, 404);
      return jsonText(`{"park":${history.park},"accommodations":${history.accommodations},"rows":${history.rows}}`);
    }),

    // Per park, how one weekend's price went for a party size.
    'GET /admin/weekend': forAdmins(async (request) => {
      const [key] = await partiesOf(request);
      const arrival = new URL(request.url).searchParams.get('arrival') ?? '';
      if (!ISO_DATE.test(arrival)) return json({ error: 'Invalid weekend' }, 400);
      const history = await db.weekendHistory(arrival, key, adminWindowStart());
      return jsonText(`{"arrival":"${arrival}","latestAt":${history.latestAt},"parks":${history.parks}}`);
    }),

    // Every size, or the ones named: the admin page names those a stopped round did not finish.
    'POST /scan': async (request) => {
      const { parties } = await readJson(request);
      const named = Array.isArray(parties) ? parties : [];
      const followed = new Set((await db.followedParties()).map((party) => party.key));
      const keys = named.filter((key) => followed.has(key));
      if (named.length && !keys.length) return json({ error: 'Unknown party size' }, 400);
      await requestScan(keys);
      return json(await status(request), 202);
    },

    // The price of one park and stay for a viewer's exact party, asked from the provider right now.
    'POST /quote': async (request) => {
      const input = await readJson(request);
      const party = partyOf(clampSettings(input));
      const { arrival, departure } = input;
      const nights = (Date.parse(departure) - Date.parse(arrival)) / DAY_MS;
      if (!ISO_DATE.test(arrival) || !ISO_DATE.test(departure) || !(nights >= 1 && nights <= MAX_QUOTE_NIGHTS)) {
        return json({ error: 'Invalid stay' }, 400);
      }
      const park = await db.park(String(input.parkCode ?? ''));
      const provider = PROVIDERS.find((candidate) => candidate.id === park?.provider);
      if (!provider?.quoteStay) return json({ error: 'Unknown park' }, 404);
      // Providers without accommodation requirements quote the stay without them, and say so.
      const ignoresFeatures = party.accommodationFeatures.length > 0 && !provider.supportsAccommodationFeatures;
      const query = { ...party, accommodationFeatures: ignoresFeatures ? [] : party.accommodationFeatures, arrival, departure };
      return json({ quote: await provider.quoteStay(park, query), ignoresFeatures, quotedAt: new Date().toISOString() });
    },

    // A phone's price alerts. The topic its ntfy app listens to is its only key: it is long and random.
    'GET /alerts': async (request) => {
      const topic = new URL(request.url).searchParams.get('topic');
      if (!validTopic(topic)) return json({ error: 'Invalid topic' }, 400);
      return json((await db.alerts(topic)).map(publicAlert));
    },

    'POST /alerts': async (request) => {
      const input = await readJson(request);
      if (!validTopic(input.topic)) return json({ error: 'Invalid topic' }, 400);
      if ((await db.alerts(input.topic)).length >= MAX_ALERTS_PER_TOPIC) return json({ error: 'Too many alerts' }, 409);
      const party = partyOf(clampSettings(input.party));
      const alert = {
        id: crypto.randomUUID(),
        topic: input.topic,
        // It watches the list's prices: those of the party's size.
        partyKey: partyKey(seriesFor(party)),
        search: cleanSearch(input.search),
        query: new URLSearchParams(String(input.query ?? '').slice(0, 1000)).toString(),
        label: String(input.label ?? '').slice(0, 200) || 'Alle buitenkansjes',
        // Deals seen on screen before the size had prices of its own are no baseline.
        primed: input.primed === true,
      };
      await db.saveAlert(alert, alert.primed ? seenDeals(input.seen) : []);
      return json(publicAlert({ ...alert, party, createdAt: new Date().toISOString() }), 201);
    },

    'DELETE /alerts': async (request) => {
      const params = new URL(request.url).searchParams;
      const removed = await db.deleteAlert(params.get('id') ?? '', params.get('topic') ?? '');
      return json({ removed }, removed ? 200 : 404);
    },

    // Sent on request only, so the phone can be checked before an alert goes off.
    'POST /alerts/test': async (request) => {
      const { topic } = await readJson(request);
      if (!validTopic(topic)) return json({ error: 'Invalid topic' }, 400);
      await sendNotification(topic, {
        title: 'Weekendje weg',
        message: 'Testmelding: je prijsalarm kan je bereiken.',
        tags: ['white_check_mark'],
      });
      return json({ sent: true });
    },

    // Settings shared by everyone: how far ahead and how often. Parties are per viewer.
    'PUT /settings': async (request) => {
      const input = Object.fromEntries(
        Object.entries(await readJson(request)).filter(([field]) => !PARTY_FIELDS.includes(field)),
      );
      const before = await db.getSettings();
      const settings = await db.saveSettings(input);
      if (before.weeksAhead < settings.weeksAhead) await requestScan();
      return json(settings);
    },
  };

  return async function handle(request) {
    const path = new URL(request.url).pathname.replace(/^\/api(?=\/)/, '');
    const route = routes[`${request.method} ${path}`];
    if (!route) return json({ error: 'Not found' }, 404);
    try {
      return await route(request);
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  };
}

async function readJson(request) {
  const body = await request.text();
  return body ? JSON.parse(body) : {};
}

// Anonymous counts of visits and of what visitors use on the site, for the admin's Bezoekers page. They go to
// Cloudflare Workers Analytics Engine (the EVENTS binding), not to Turso, so busy days cost no database rows.
// No cookies and no IP addresses: a visitor is the code of one day that clicks use too (visitorOf in handler.mjs).
// No Node imports: the Worker uses these.

export const EVENTS_DATASET = 'parkjeweg_events';

// What the site itself reports (src/lib/track.js). Views of the server's own pages and clicks to providers are
// counted on the server.
const CLIENT_EVENTS = new Set(['view', 'filter', 'weekend', 'mode', 'sort', 'park', 'alert', 'party', 'more']);
const MAX_EVENTS = 30;
const MAX_BODY = 8192;
// Control names, park codes, dates and numbers; never free text such as a search or an address.
const TEXT = /^[\p{L}\p{N} _.,:-]{0,64}$/u;
const PATH = /^\/[a-z0-9/._-]{0,120}$/;
const PAGE_KINDS = new Set(['park', 'parken', 'weekend', 'weekenden', 'regio', 'thema', 'land', 'feestdag', 'vakantie', 'last-minute', 'privacy', 'zo-werkt-het']);
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|python|curl|wget|httpclient|java\//i;
const SOURCES = [
  ['google', /(^|\.)google\.[a-z.]+$/],
  ['bing', /(^|\.)bing\.com$/],
  ['duckduckgo', /(^|\.)duckduckgo\.com$/],
  ['ecosia', /(^|\.)ecosia\.org$/],
  ['yahoo', /(^|\.)yahoo\.[a-z.]+$/],
  ['facebook', /(^|\.)(facebook\.com|fb\.me)$/],
  ['instagram', /(^|\.)instagram\.com$/],
  ['pinterest', /(^|\.)pinterest\.[a-z.]+$/],
  ['reddit', /(^|\.)reddit\.com$/],
  ['x', /(^|\.)(t\.co|x\.com|twitter\.com)$/],
  ['linkedin', /(^|\.)(linkedin\.com|lnkd\.in)$/],
  ['whatsapp', /(^|\.)whatsapp\.(com|net)$/],
];

const text = (value) => (value == null ? '' : typeof value === 'string' && TEXT.test(value) ? value : null);

/** A real person's browser, and not the admin (who carries Cloudflare Access's cookie): only those are counted. */
export function countsAsVisit(request) {
  const agent = request.headers.get('User-Agent') ?? '';
  return agent !== '' && !BOT.test(agent) && !/(?:^|;\s*)CF_Authorization=/.test(request.headers.get('Cookie') ?? '');
}

/** What kind of page a path is: home, park, weekend, regio and so on. */
export function pageKind(pathname) {
  if (pathname === '/') return 'home';
  const first = pathname.split('/')[1];
  return PAGE_KINDS.has(first) ? first : 'other';
}

/**
 * Where a visit came from: the campaign in `utm_source` if a link has one, else the referring site by name (google,
 * facebook, …) or host, `direct` without one, and `intern` from this site's own pages.
 */
export function trafficSource(referrer, ownHost, campaign = '') {
  const tag = text(campaign?.toLowerCase().slice(0, 32));
  if (tag) return tag;
  let host;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return 'direct';
  }
  if (host === ownHost.replace(/^www\./, '')) return 'intern';
  return SOURCES.find(([, pattern]) => pattern.test(host))?.[0] ?? host.slice(0, 64);
}

export function deviceOf(agent = '') {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(agent)) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(agent)) return 'mobiel';
  return 'desktop';
}

/**
 * One count as Analytics Engine stores it. The visitor is the index, so sampling on busy days keeps or drops a
 * visitor's counts together. blob1 event, blob2 key, blob3 value, blob4 path or place, blob5 source, blob6 device,
 * blob7 country; double1 a number (a position in the list, say).
 */
export function eventPoint(request, visitor, { name, key = '', value = '', path = '', source = '', number = 0 }) {
  return {
    indexes: [visitor ?? ''],
    blobs: [name, key, value, path, source, deviceOf(request.headers.get('User-Agent') ?? ''), request.cf?.country ?? ''],
    doubles: [number],
  };
}

/** A visit to one of the server's own pages (server/pages.mjs), as browsers open them; not a crawler's fetch. */
export function pageViewPoint(request, visitor) {
  const { hostname, pathname, searchParams } = new URL(request.url);
  const source = trafficSource(request.headers.get('Referer'), hostname, searchParams.get('utm_source') ?? '');
  return eventPoint(request, visitor, { name: 'view', key: pageKind(pathname), path: pathname, source });
}

export const isPageView = (request) => request.headers.get('Sec-Fetch-Mode') === 'navigate' && countsAsVisit(request);

/** The counts a batch from src/lib/track.js holds that this site sends; anything else is dropped. */
export function clientEventPoints(request, visitor, bodyText) {
  if (bodyText.length > MAX_BODY) return [];
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return [];
  }
  const { hostname } = new URL(request.url);
  const path = typeof body?.path === 'string' && PATH.test(body.path) ? body.path : '/';
  const source = trafficSource(body?.referrer, hostname, body?.campaign ?? '');
  return (Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS) : [])
    .filter((event) => CLIENT_EVENTS.has(event?.name) && text(event.key) !== null && text(event.value) !== null)
    .map(({ name, key, value, number }) =>
      eventPoint(request, visitor, {
        name,
        key: name === 'view' ? pageKind(path) : (key ?? ''),
        value: value ?? '',
        path,
        source: name === 'view' ? source : '',
        number: Number.isFinite(number) ? Math.max(-1e6, Math.min(1e6, number)) : 0,
      }),
    );
}

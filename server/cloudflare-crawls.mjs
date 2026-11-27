import ipaddr from 'ipaddr.js';
import { GOOGLEBOT_PATHS } from './index-tracking.mjs';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4/graphql';
const GOOGLE_CRAWLER_IPS = 'https://developers.google.com/static/crawling/ipranges/common-crawlers.json';
const SITE_HOST = 'parkjeweg.nl';
const DAY_MS = 24 * 60 * 60 * 1000;
const GOOGLEBOT = /\bGooglebot\/2\.1\b/;
const QUERY = `query ($zone: string, $from: Time, $to: Time, $host: string, $paths: [string!]) {
  viewer {
    zones(filter: {zoneTag: $zone}) {
      httpRequestsAdaptiveGroups(
        limit: 1000, orderBy: [datetime_DESC],
        filter: {datetime_geq: $from, datetime_leq: $to, clientRequestHTTPHost: $host,
                 clientRequestPath_in: $paths, userAgent_like: "%Googlebot/2.1%"}
      ) {
        dimensions { clientIP clientRequestPath datetime edgeResponseStatus userAgent }
      }
    }
  }
}`;

function googlebotVisit({ dimensions }, ranges) {
  const { clientIP, clientRequestPath: path, datetime, edgeResponseStatus: status, userAgent } = dimensions;
  if (GOOGLEBOT_PATHS.includes(path) === false || GOOGLEBOT.test(userAgent) === false ||
      typeof clientIP !== 'string' || ipaddr.isValid(clientIP) === false) {
    return null;
  }
  const timestamp = Date.parse(datetime);
  if (Number.isFinite(timestamp) === false || Number.isInteger(status) === false || status < 100 || status > 599) {
    return null;
  }
  const address = ipaddr.process(clientIP);
  if (ranges.some((range) => range[0].kind() === address.kind() && address.match(range)) === false) {
    return null;
  }
  return { path, visitedAt: new Date(timestamp).toISOString(), status };
}

function newestVisits(rows, prefixes) {
  const ranges = prefixes.map(({ ipv4Prefix, ipv6Prefix }) => ipaddr.parseCIDR(ipv4Prefix ?? ipv6Prefix));
  const latest = new Map();
  for (const row of rows) {
    const visit = googlebotVisit(row, ranges);
    if (visit === null) {
      continue;
    }
    const previous = latest.get(visit.path);
    if (previous === undefined || visit.visitedAt > previous.visitedAt ||
        (visit.visitedAt === previous.visitedAt && visit.status > previous.status)) {
      latest.set(visit.path, visit);
    }
  }
  return [...latest.values()];
}

async function readJson(url, options, send) {
  const response = await send(url, options);
  if (response.ok === false) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  }
  return response.json();
}

/** Only the time and status of the latest verified Googlebot request per tracked page leave this function. */
export async function fetchGooglebotCrawls({ token, zone, now = Date.now(), send = fetch }) {
  const from = new Date(now - DAY_MS).toISOString();
  const to = new Date(now).toISOString();
  const [result, { prefixes }] = await Promise.all([
    readJson(CLOUDFLARE_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { zone, from, to, host: SITE_HOST, paths: GOOGLEBOT_PATHS } }),
    }, send),
    readJson(GOOGLE_CRAWLER_IPS, {}, send),
  ]);
  const rows = result.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups;
  if (result.errors?.length > 0 || Array.isArray(rows) === false || Array.isArray(prefixes) === false || prefixes.length === 0) {
    throw new Error('Cloudflare Analytics or Google crawler IPs unavailable');
  }
  return newestVisits(rows, prefixes);
}

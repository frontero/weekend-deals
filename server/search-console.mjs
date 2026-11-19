// Reads Google Search Console for the admin's SEO page: which searches show the site, how often, where, and how many
// click. Signed in as a service account that was added to the property as a restricted user
// (scripts/setup-search-console.sh). Node only: the rounds run it, not the Worker.
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API = 'https://www.googleapis.com/webmasters/v3';
// The property as Search Console names a domain verified through DNS.
export const SITE_PROPERTY = 'sc-domain:parkjeweg.nl';

const base64url = (value) => Buffer.from(value).toString('base64url');

/** The service account from GSC_SERVICE_ACCOUNT: its key file's JSON, base64 on one line; null without one. */
export function serviceAccount(env = process.env) {
  if (!env.GSC_SERVICE_ACCOUNT) return null;
  const account = JSON.parse(Buffer.from(env.GSC_SERVICE_ACCOUNT, 'base64').toString('utf8'));
  if (!account.client_email || !account.private_key) throw new Error('GSC_SERVICE_ACCOUNT misses client_email or private_key');
  return account;
}

/** A read-only access token for the account, good for an hour. */
export async function accessToken(account, { fetcher = fetch, now = Date.now() } = {}) {
  const seconds = Math.floor(now / 1000);
  const claims = { iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: seconds, exp: seconds + 3600 };
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
  const response = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!response.ok) throw new Error(`Google gave no token: ${response.status} ${(await response.text()).slice(0, 200)}`);
  return (await response.json()).access_token;
}

/**
 * Search figures per the dimensions asked for, e.g. ['query', 'page'].
 * @returns [{ keys, clicks, impressions, ctr, position }]
 */
export async function searchAnalytics(token, { startDate, endDate, dimensions, rowLimit = 1000, site = SITE_PROPERTY }, { fetcher = fetch } = {}) {
  const response = await fetcher(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }),
  });
  if (!response.ok) throw new Error(`Search Console answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return (await response.json()).rows ?? [];
}

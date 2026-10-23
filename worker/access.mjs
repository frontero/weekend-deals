// Cloudflare Access signs every request it lets through. Checking that signature here keeps the data closed even
// when Access is switched off or missing, e.g. on a new address of the app.
const KEYS_MAX_AGE_MS = 60 * 60 * 1000;
// Keys rotate, so an unknown key id fetches them again, but not more often than this.
const KEYS_REFRESH_MS = 60 * 1000;

let cache = null;

const bytes = (base64Url) =>
  Uint8Array.from(atob(base64Url.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
const decodeJson = (part) => JSON.parse(new TextDecoder().decode(bytes(part)));

/** "https://team.cloudflareaccess.com/cdn-cgi/access/certs" and "team.cloudflareaccess.com" both give the host. */
export const teamHost = (value) => value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

/** @param admins comma-separated email addresses; none set means nobody is admin */
export function isAdminEmail(email, admins = '') {
  const normalise = (address) => String(address ?? '').trim().toLowerCase();
  return Boolean(normalise(email)) && admins.split(',').map(normalise).includes(normalise(email));
}

async function signingKeys(team, refresh = false) {
  const age = cache?.team === team ? Date.now() - cache.fetchedAt : Infinity;
  if (age < (refresh ? KEYS_REFRESH_MS : KEYS_MAX_AGE_MS)) return cache.keys;
  const response = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`Access keys answered ${response.status}`);
  cache = { team, fetchedAt: Date.now(), keys: (await response.json()).keys ?? [] };
  return cache.keys;
}

/**
 * @param env ACCESS_TEAM_DOMAIN and ACCESS_AUD (the Access application's audience tag)
 * @returns the token's claims, among them the visitor's `email`, or null when Access did not let the request in
 */
export async function verifyAccess(request, env, now = Date.now()) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const team = teamHost(env.ACCESS_TEAM_DOMAIN);
  const [headerPart, payloadPart, signaturePart] = token.split('.');

  try {
    const header = decodeJson(headerPart);
    if (header.alg !== 'RS256') return null;
    const findKey = (keys) => keys.find((key) => key.kid === header.kid);
    const jwk = findKey(await signingKeys(team)) ?? findKey(await signingKeys(team, true));
    if (!jwk) return null;

    const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
    const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    if (!(await crypto.subtle.verify(algorithm, key, bytes(signaturePart), signed))) return null;

    const claims = decodeJson(payloadPart);
    const valid = [claims.aud].flat().includes(env.ACCESS_AUD) && claims.iss === `https://${team}` && claims.exp * 1000 > now;
    return valid ? claims : null;
  } catch {
    return null;
  }
}

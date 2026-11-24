// Where a click on a provider's link goes: the provider's own site, through its affiliate link once one is set.
// No Node imports: the cloud app redirects from here too.

// The sites a tracked link may lead to. Anything else would make /api/go an open redirect.
const PROVIDER_DOMAINS = {
  'landal.nl': 'landal',
  'hofvansaksen.nl': 'landal',
  'topparken.nl': 'topparken',
  'molecaten.nl': 'molecaten',
};

/** The provider an https link belongs to, or null for any other site. */
export function providerOfUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const domain = Object.keys(PROVIDER_DOMAINS).find((name) => parsed.hostname === name || parsed.hostname.endsWith(`.${name}`));
  return domain ? PROVIDER_DOMAINS[domain] : null;
}

/**
 * @param templates per provider, the affiliate network's deep link with `{url}` where the encoded provider page goes,
 *   e.g. { "landal": "https://network.example/c/?si=1&li=2&dl={url}" }, or `{path}` for a network that links on the
 *   provider's own domain and takes only the page's path, as TradeTracker does:
 *   "https://www.topparken.nl/tt/?tt=1_12_3_{ref}&r={path}". `{ref}` is where the click came from, for the network's
 *   own reports. A provider without a template gets its plain link.
 * @param reference a short note on the click (the park and the place on the site); only letters, digits and dashes go out
 */
export function affiliateUrl(provider, url, templates = {}, reference = '') {
  const template = templates[provider];
  if (typeof template !== 'string' || !/\{(url|path)\}/.test(template)) return url;
  const { pathname, search } = new URL(url);
  const note = reference.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  return template
    .replaceAll('{url}', encodeURIComponent(url))
    .replaceAll('{path}', encodeURIComponent(`${pathname}${search}`))
    .replaceAll('{ref}', note);
}

/** The templates from the AFFILIATE_LINKS setting (JSON); none when it is missing or unreadable. */
export function parseAffiliateLinks(json) {
  try {
    const value = JSON.parse(json || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

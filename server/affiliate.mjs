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
 *   e.g. { "landal": "https://network.example/c/?si=1&li=2&dl={url}" }; a provider without one gets its plain link
 */
export function affiliateUrl(provider, url, templates = {}) {
  const template = templates[provider];
  return typeof template === 'string' && template.includes('{url}') ? template.replaceAll('{url}', encodeURIComponent(url)) : url;
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

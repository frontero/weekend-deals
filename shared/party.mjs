// A travel party: who goes, and what the accommodation must have. The list shows prices per party size, collected
// for a few sizes ahead of time so every visitor sees prices at once; a party's exact price (children, pets,
// requirements) is asked live per park, see POST /api/quote.

export const PARTY_FIELDS = ['adults', 'children', 'pets', 'accommodationFeatures'];

export const PARTY_SIZES = [2, 3, 4, 5, 6, 8, 10, 12];
export const STANDARD_PARTIES = PARTY_SIZES.map((adults) => ({ adults, children: 0, pets: 0, accommodationFeatures: [] }));

export const partyOf = (settings) => Object.fromEntries(PARTY_FIELDS.map((field) => [field, settings[field]]));

export const persons = (party) => party.adults + party.children;

/** The size whose prices the list shows for a party: the smallest that fits everyone, else the largest. */
export function seriesFor(party) {
  const size = PARTY_SIZES.find((candidate) => candidate >= persons(party)) ?? PARTY_SIZES.at(-1);
  return STANDARD_PARTIES[PARTY_SIZES.indexOf(size)];
}

/** Prices are only comparable within one travel party and one set of accommodation requirements. */
export function groupKey({ adults, children, pets = 0, accommodationFeatures = [] }) {
  return [
    `a${adults}`,
    `c${children}`,
    pets ? `p${pets}` : null,
    accommodationFeatures.length ? `f${[...accommodationFeatures].sort().join('+')}` : null,
  ]
    .filter(Boolean)
    .join('-');
}

/** The party behind a group key, or null for anything that is not one. */
export function parseGroupKey(key) {
  const match = /^a(\d+)-c(\d+)(?:-p(\d+))?(?:-f([\d.+]+))?$/.exec(key);
  if (!match) return null;
  const [, adults, children, pets = '0', features] = match;
  return {
    adults: Number(adults),
    children: Number(children),
    pets: Number(pets),
    accommodationFeatures: features ? features.split('+') : [],
  };
}

/** "6 personen", as the screen names a party size. */
export const partyLabel = (party) => `${persons(party)} personen`;

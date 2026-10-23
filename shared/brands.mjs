// Landal sells parks of several brands (its own, Roompot, Summio, Dormio, …) and its own brand code mostly says
// "LGP" regardless. The name a park carries on Google ("Roompot Zandvoort") is the more reliable signal.
const BRAND_WORDS = [
  ['roompot', /\broompot\b/i],
  ['summio', /\bsummio\b/i],
  ['dormio', /\bdormio\b/i],
  ['europarcs', /\beuroparcs\b/i],
  ['centerparcs', /\bcenter\s*parcs\b/i],
  ['topparken', /\btop\s*parken\b/i],
  ['molecaten', /\bmolecaten\b/i],
  ['landal', /\blandal\b/i],
];

const LANDAL_BRAND_CODES = { LGP: 'landal', RGP: 'roompot', HSN: 'hofvansaksen' };

/** The park's brand id, e.g. "roompot", from its Google name, else Landal's brand code, else its provider. */
export function parkBrand({ provider, placeName, brandCode }) {
  const fromName = placeName && BRAND_WORDS.find(([, pattern]) => pattern.test(placeName));
  if (fromName) return fromName[0];
  return LANDAL_BRAND_CODES[brandCode] ?? provider ?? 'landal';
}

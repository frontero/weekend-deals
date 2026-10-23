/** The accommodation behind a weekend's price, when its details are known. */
export const accommodationFor = (park, weekend) => park?.accommodations?.[weekend?.accommodationCode] ?? null;

/** "Lariks 6 · 42 m² · Vrijstaand": the name and the first few facts. */
export function accommodationSummary(accommodation, factCount = 2) {
  if (!accommodation) return '';
  return [accommodation.name, ...accommodation.facts.slice(0, factCount)].filter(Boolean).join(' · ');
}

/** Photo URLs of the accommodation behind the price; without those, the park's own photo. */
export function photosFor(park, weekend) {
  const photos = accommodationFor(park, weekend)?.photos ?? [];
  if (photos.length) return photos;
  return park?.imageUrl ? [park.imageUrl] : [];
}

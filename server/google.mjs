import { distanceMetres } from '../shared/geo.mjs';

// Stays under the 1,000 free rating lookups Google gives per month.
export const MONTHLY_GOOGLE_BUDGET = 900;
const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
// Rating fields make every call a "Text Search Enterprise" call; Google gives 1,000 of those free per month.
const FIELD_MASK = 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.googleMapsUri';
const SEARCH_RADIUS_METRES = 2000;
// Large parks: Landal's pin and Google's can sit a kilometre or two apart.
const MAX_DISTANCE_METRES = 3000;
// Some Landal pins are far off; a place with exactly the park's name may then sit this far away.
const MAX_DISTANCE_SAME_NAME_METRES = 30_000;
const BRAND_WORDS = /\b(landal|roompot|europarcs|dormio|molecaten|topparken)\b/g;

export { distanceMetres };

const normaliseName = (name) =>
  name
    .toLowerCase()
    .replace(BRAND_WORDS, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Brand first: many parks carry their town's name ("Zandvoort"), and without it Google finds the town. */
export function ratingQueries(park, brand = 'Landal') {
  const plain = [park.name, park.city].filter(Boolean).join(', ');
  return park.name.toLowerCase().includes(brand.toLowerCase()) ? [plain] : [`${brand} ${plain}`, plain];
}

export function searchBody(textQuery, park) {
  return {
    textQuery,
    locationBias: {
      circle: { center: { latitude: park.lat, longitude: park.lng }, radius: SEARCH_RADIUS_METRES },
    },
  };
}

/** The most relevant result that lies at the park itself, so a nearby restaurant or other park never counts. */
export function pickPlace(places, park) {
  const parkName = normaliseName(park.name);
  const match = places.find((place) => {
    // Towns, streets and single cabins have no reviews.
    if (!place.location || !place.userRatingCount) return false;
    const distance = distanceMetres(park, { lat: place.location.latitude, lng: place.location.longitude });
    return (
      distance <= MAX_DISTANCE_METRES ||
      (distance <= MAX_DISTANCE_SAME_NAME_METRES && normaliseName(place.displayName?.text ?? '') === parkName)
    );
  });
  if (!match) return null;
  return {
    placeId: match.id,
    placeName: match.displayName?.text ?? null,
    rating: match.rating ?? null,
    ratingCount: match.userRatingCount ?? 0,
    mapsUrl: match.googleMapsUri ?? null,
  };
}

async function searchPlaces(textQuery, park, apiKey) {
  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify(searchBody(textQuery, park)),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message ?? `Google answered ${response.status}`);
  return json.places ?? [];
}

/** Tries each query until one finds the park; `onRequest` runs before every billed call. */
export async function fetchGoogleRating(park, apiKey, { onRequest = () => {}, brand } = {}) {
  for (const textQuery of ratingQueries(park, brand)) {
    await onRequest();
    const match = pickPlace(await searchPlaces(textQuery, park, apiKey), park);
    if (match) return match;
  }
  return null;
}

const DETAILS_URL = 'https://places.googleapis.com/v1/places/';
// Asking for reviews bills the call as "Place Details Enterprise + Atmosphere". Google's terms do not allow keeping
// reviews, so they are asked for when someone opens them, within this monthly limit.
export const MONTHLY_REVIEW_BUDGET = 200;
export const REVIEW_COUNTER = 'googleReviewRequests';

/**
 * A place's reviews in Dutch where Google translates them: at most five, ordered by relevance, with what Google
 * requires to show next to them (the author with a link to their profile, and a link to each review on Google Maps).
 */
export async function fetchPlaceReviews(placeId, apiKey, fetchImpl = fetch) {
  const response = await fetchImpl(`${DETAILS_URL}${encodeURIComponent(placeId)}?languageCode=nl`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'reviews,googleMapsUri' },
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message ?? `Google answered ${response.status}`);
  return {
    mapsUrl: json.googleMapsUri ?? null,
    reviews: (json.reviews ?? []).map((review) => ({
      author: review.authorAttribution?.displayName ?? 'Google-gebruiker',
      authorUrl: review.authorAttribution?.uri ?? null,
      photoUrl: review.authorAttribution?.photoUri ?? null,
      rating: review.rating ?? null,
      when: review.relativePublishTimeDescription ?? '',
      // Google asks for the visit date with reviews of places in France; shown wherever it comes along.
      visited: review.visitDate?.year ? { year: review.visitDate.year, month: review.visitDate.month ?? null } : null,
      text: review.text?.text ?? review.originalText?.text ?? '',
      translatedFrom:
        review.originalText && review.text && review.originalText.languageCode !== review.text.languageCode
          ? review.originalText.languageCode
          : null,
      url: review.googleMapsUri ?? null,
    })),
  };
}

// What there is to do around a park: castles, museums, zoos, beaches and nature from Wikidata (free to reuse, CC0),
// with a photo from Wikimedia Commons and its maker and license, as that license asks. Only places with a Wikipedia
// article in a few languages count: that keeps out the thousands of listed buildings and small monasteries.
import { fetchWithRetry, textOf } from './http.mjs';

const SPARQL_URL = 'https://query.wikidata.org/sparql';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia asks for a User-Agent that says who is asking.
const USER_AGENT = 'weekend-deals/0.1 (weekend price comparison; https://github.com/frontero/weekend-deals)';
const RADIUS_KM = 15;
const MIN_SITELINKS = 2;
export const MAX_PLACES = 8;
// One of Wikimedia's standard thumbnail sizes; others are rounded up to the next one.
const PHOTO_WIDTH = 500;

// Wikidata classes (instance of, as such) and how the page names them; `group` caps how many of a sort a park shows.
const KINDS = {
  Q2416723: { kind: 'Pretpark', group: 'uitje' },
  Q194195: { kind: 'Pretpark', group: 'uitje' },
  Q43501: { kind: 'Dierentuin', group: 'uitje' },
  Q2281788: { kind: 'Aquarium', group: 'uitje' },
  Q740326: { kind: 'Zwemparadijs', group: 'uitje' },
  Q23413: { kind: 'Kasteel', group: 'kasteel' },
  Q751876: { kind: 'Kasteel', group: 'kasteel' },
  Q16560: { kind: 'Paleis', group: 'kasteel' },
  Q879050: { kind: 'Landhuis', group: 'kasteel' },
  Q57821: { kind: 'Vesting', group: 'kasteel' },
  Q1785071: { kind: 'Fort', group: 'kasteel' },
  Q33506: { kind: 'Museum', group: 'museum' },
  Q207694: { kind: 'Kunstmuseum', group: 'museum' },
  Q588140: { kind: 'Historisch museum', group: 'museum' },
  Q756102: { kind: 'Openluchtmuseum', group: 'museum' },
  Q1970365: { kind: 'Natuurmuseum', group: 'museum' },
  Q2398990: { kind: 'Techniekmuseum', group: 'museum' },
  Q40080: { kind: 'Strand', group: 'natuur' },
  Q46169: { kind: 'Nationaal park', group: 'natuur' },
  Q179049: { kind: 'Natuurgebied', group: 'natuur' },
  Q4421: { kind: 'Bos', group: 'natuur' },
  Q23397: { kind: 'Meer', group: 'natuur' },
  Q1440300: { kind: 'Uitkijktoren', group: 'uitzicht' },
  Q8502: { kind: 'Berg', group: 'uitzicht' },
  Q54050: { kind: 'Heuvel', group: 'uitzicht' },
  Q35509: { kind: 'Grot', group: 'uitzicht' },
  Q34038: { kind: 'Waterval', group: 'uitzicht' },
  Q130003: { kind: 'Skigebied', group: 'uitzicht' },
  Q38720: { kind: 'Molen', group: 'molen' },
  Q570116: { kind: 'Bezienswaardigheid', group: 'overig' },
};
const PER_GROUP = { uitje: 3, kasteel: 2, museum: 2, natuur: 2, uitzicht: 2, molen: 1, overig: 2 };

/** Places of the kinds above within the radius, with a Dutch name, as Wikidata's query service lists them. */
export const nearbyQuery = ({ lat, lng }, radiusKm = RADIUS_KM) => `SELECT ?item ?label ?desc ?image ?dist ?kind ?links WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?location .
    bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
    bd:serviceParam wikibase:distance ?dist .
  }
  VALUES ?kind { ${Object.keys(KINDS).map((id) => `wd:${id}`).join(' ')} }
  ?item wdt:P31 ?kind ; wikibase:sitelinks ?links .
  FILTER(?links >= ${MIN_SITELINKS})
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  FILTER NOT EXISTS { ?item wdt:P3999 [] }
  ?item rdfs:label ?label FILTER(LANG(?label) = "nl")
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "nl") }
  OPTIONAL { ?item wdt:P18 ?image }
}`;

const lastPart = (uri) => decodeURIComponent(uri.split('/').pop());

/**
 * The places worth showing, best first: well known (articles in many languages) and close by count most. A place
 * listed under several kinds or twice counts once; each sort is capped, so a city full of museums leaves room for
 * the beach and the zoo.
 * @param rows the query's result bindings
 */
export function pickPlaces(rows, max = MAX_PLACES) {
  const byItem = new Map();
  for (const row of rows) {
    const id = lastPart(row.item.value);
    const kind = KINDS[lastPart(row.kind.value)];
    if (!kind || byItem.has(id)) continue;
    const km = Number(row.dist.value);
    byItem.set(id, {
      id,
      name: row.label.value,
      ...kind,
      km: Math.round(km * 10) / 10,
      description: row.desc?.value ?? null,
      imageFile: row.image ? lastPart(row.image.value) : null,
      score: Number(row.links.value) / (1 + km / 8),
    });
  }
  const picked = [];
  const names = new Set();
  const perGroup = {};
  for (const place of [...byItem.values()].sort((a, b) => b.score - a.score)) {
    const name = place.name.toLowerCase();
    if (names.has(name) || (perGroup[place.group] ?? 0) >= PER_GROUP[place.group]) continue;
    names.add(name);
    perGroup[place.group] = (perGroup[place.group] ?? 0) + 1;
    picked.push(place);
    if (picked.length === max) break;
  }
  return picked.map(({ score, group, ...place }) => place);
}

/** Commons' answer per file: a thumbnail and whom and which license to credit. Files without a license are left out. */
export function parseCommonsImages(json) {
  const images = new Map();
  for (const page of Object.values(json.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    const license = meta.LicenseShortName?.value;
    if (!info?.thumburl || !license) continue;
    images.set(page.title.replace(/^File:/, ''), {
      url: info.thumburl,
      page: info.descriptionurl,
      author: textOf(meta.Artist?.value ?? '') || null,
      license: textOf(license),
    });
  }
  return images;
}

async function commonsImages(files) {
  if (!files.length) return new Map();
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(PHOTO_WIDTH),
    iiextmetadatafilter: 'Artist|LicenseShortName',
    titles: files.map((file) => `File:${file}`).join('|'),
  });
  const response = await fetchWithRetry(`${COMMONS_API}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  const json = await response.json();
  // Commons answers with the normalised title (underscores as spaces); map it back to the file name asked for.
  const normalised = new Map((json.query?.normalized ?? []).map(({ from, to }) => [to.replace(/^File:/, ''), from.replace(/^File:/, '')]));
  const images = parseCommonsImages(json);
  return new Map([...images].map(([title, image]) => [normalised.get(title) ?? title, image]));
}

/** @returns up to MAX_PLACES places around the park: { id, name, kind, km, description, image } */
export async function fetchSurroundings(park) {
  const params = new URLSearchParams({ query: nearbyQuery(park), format: 'json' });
  // Around a city the query service can take most of its own one-minute limit.
  const response = await fetchWithRetry(`${SPARQL_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
    timeoutMs: 65_000,
  });
  const places = pickPlaces((await response.json()).results.bindings);
  const images = await commonsImages(places.map((place) => place.imageFile).filter(Boolean));
  return places.map(({ imageFile, ...place }) => ({ ...place, image: images.get(imageFile) ?? null }));
}

import { distanceMetres } from '../shared/geo.mjs';
import { shiftDays } from '../shared/weekends.mjs';
import { DUTCH_GERMAN_LAND_BORDER } from './dutch-german-border.mjs';

// The provider's park guide names these more specific areas than its park feed does.
// https://www.landal.nl/bestemmingen/duitsland
const PARK_REGIONS = new Map([
  ['BBM', 'Grafschaft Bentheim'],
  ['KEE', 'Eifel'],
  ['HRG', 'Ruppiner Seenland'],
  ['MSA', 'Oldenburger Münsterland'],
  ['HMR', 'Oostzeekust'],
]);
const REGION_NAMES = new Map([
  ['Oldenburger Munsterland', 'Oldenburger Münsterland'],
  ['Oostzee', 'Oostzeekust'],
  ['Saar/Hunsrück', 'Saar en Hunsrück'],
]);

export function germanRegion(park) {
  const known = PARK_REGIONS.get(park.code);
  if (known !== undefined) {
    return known;
  }
  const region = park.region?.replace(/\s*\(DE\)$/, '').trim();
  if (region === undefined || region === '') {
    return 'Overig Duitsland';
  }
  return REGION_NAMES.get(region) ?? region;
}

// Project onto the short border segment, weighting longitude at its latitude; measure to that point on the globe.
function distanceToSegment(park, [startLng, startLat], [endLng, endLat]) {
  const longitudeScale = Math.cos(((startLat + endLat) * Math.PI) / 360);
  const width = (endLng - startLng) * longitudeScale;
  const height = endLat - startLat;
  const lengthSquared = width ** 2 + height ** 2;
  if (lengthSquared === 0) {
    return distanceMetres(park, { lat: startLat, lng: startLng });
  }
  const projection = ((park.lng - startLng) * longitudeScale * width + (park.lat - startLat) * height) / lengthSquared;
  const position = Math.max(0, Math.min(1, projection));
  return distanceMetres(park, { lat: startLat + position * height, lng: startLng + position * (endLng - startLng) });
}

export function distanceToDutchBorder(park) {
  if (Number.isFinite(park.lat) === false || Number.isFinite(park.lng) === false) {
    return null;
  }
  const metres = DUTCH_GERMAN_LAND_BORDER.reduce(
    (nearest, line) => line.slice(1).reduce((distance, end, index) => Math.min(distance, distanceToSegment(park, line[index], end)), nearest),
    Infinity,
  );
  return metres / 1000;
}

export function germanComparisonWeekend(parks, today) {
  const weekends = parks.flatMap((park) => park.weekends).filter(({ arrival, departure }) =>
    arrival >= today && new Date(`${arrival}T00:00:00Z`).getUTCDay() === 5 && departure === shiftDays(arrival, 3),
  );
  return weekends.sort((first, second) => first.arrival.localeCompare(second.arrival))[0] ?? null;
}

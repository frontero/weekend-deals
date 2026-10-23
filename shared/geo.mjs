const EARTH_RADIUS_METRES = 6_371_000;

const radians = (degrees) => (degrees * Math.PI) / 180;

/** Straight-line ("as the crow flies") distance between two { lat, lng } points. */
export function distanceMetres(a, b) {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(h));
}

export const distanceKm = (a, b) => Math.round(distanceMetres(a, b) / 1000);

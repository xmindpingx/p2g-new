// places2go — Geo utilities
// Pure functions only. No React, no store imports.

const EARTH_RADIUS_MILES = 3958.8;          // mean Earth radius (6371.0 km)
const MILES_PER_DEGREE_LATITUDE = 69.0;     // approximate; used only for map deltas

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in miles between two { latitude, longitude } points.
 * Returns null if either point is missing.
 */
export function distanceMiles(a, b) {
  if (
    !a || !b ||
    !Number.isFinite(a.latitude) || !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)
  ) {
    return null;
  }
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/**
 * Human-readable distance label. Returns null when distance is unknown so
 * callers can omit it rather than display a placeholder value.
 */
export function formatDistance(miles) {
  if (!Number.isFinite(miles)) return null;
  if (miles < 0.1) return '< 0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export const milesToLatitudeDelta = (miles) => miles / MILES_PER_DEGREE_LATITUDE;

export const milesToLongitudeDelta = (miles, latitude) =>
  miles / (MILES_PER_DEGREE_LATITUDE * Math.max(Math.cos(toRadians(latitude)), 0.01));

/**
 * A map region centred on a point, showing roughly `radiusMiles` in every direction.
 */
export function regionAround({ latitude, longitude }, radiusMiles = 2) {
  const span = radiusMiles * 2;
  return {
    latitude,
    longitude,
    latitudeDelta:  milesToLatitudeDelta(span),
    longitudeDelta: milesToLongitudeDelta(span, latitude),
  };
}

/**
 * A map region that contains every coordinate in `coords`, with padding.
 * Returns null for an empty list.
 */
export function regionFromCoords(coords, paddingFactor = 1.4) {
  const valid = (coords || []).filter(
    (c) => c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude),
  );
  if (valid.length === 0) return null;

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const c of valid) {
    if (c.latitude  < minLat) minLat = c.latitude;
    if (c.latitude  > maxLat) maxLat = c.latitude;
    if (c.longitude < minLng) minLng = c.longitude;
    if (c.longitude > maxLng) maxLng = c.longitude;
  }

  const MIN_DELTA = 0.01; // never zoom in past roughly a neighbourhood block
  return {
    latitude:       (minLat + maxLat) / 2,
    longitude:      (minLng + maxLng) / 2,
    latitudeDelta:  Math.max((maxLat - minLat) * paddingFactor, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * paddingFactor, MIN_DELTA),
  };
}

// Neutral world view used only when there is nothing at all to centre on.
export const WORLD_REGION = {
  latitude: 0,
  longitude: 0,
  latitudeDelta: 90,
  longitudeDelta: 90,
};

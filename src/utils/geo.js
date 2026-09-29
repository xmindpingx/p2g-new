// places2go — Geo utilities
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
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

// ---------------------------------------------------------------------------
// Bearings (for the approach arrow)
// ---------------------------------------------------------------------------
const toDegrees = (radians) => (radians * 180) / Math.PI;

export const METERS_PER_MILE = 1609.344;

export const distanceMeters = (a, b) => {
  const miles = distanceMiles(a, b);
  return miles === null ? null : miles * METERS_PER_MILE;
};

/**
 * bearingDegrees(from, to) — initial great-circle bearing from `from` to `to`,
 * 0–360 clockwise from true north. Null when a point is missing.
 */
export function bearingDegrees(from, to) {
  if (
    !from || !to ||
    !Number.isFinite(from.latitude) || !Number.isFinite(from.longitude) ||
    !Number.isFinite(to.latitude)   || !Number.isFinite(to.longitude)
  ) {
    return null;
  }
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/**
 * relativeBearing(targetBearing, heading) — how far to turn, −180…180.
 * Negative = target is to the left, positive = to the right.
 */
export function relativeBearing(targetBearing, heading) {
  if (!Number.isFinite(targetBearing) || !Number.isFinite(heading)) return null;
  let diff = (targetBearing - heading) % 360;
  if (diff > 180)  diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function compassPoint(bearing) {
  if (!Number.isFinite(bearing)) return null;
  return COMPASS_POINTS[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}

export const COMPASS_POINT_NAMES = {
  N: 'north', NE: 'north-east', E: 'east', SE: 'south-east',
  S: 'south', SW: 'south-west', W: 'west', SW2: 'south-west', NW: 'north-west',
};

/**
 * describeRelativeBearing(diff) — a short instruction for the approach card.
 */
export function describeRelativeBearing(diff) {
  if (!Number.isFinite(diff)) return null;
  const a = Math.abs(diff);
  if (a <= 20)  return 'Straight ahead';
  if (a <= 60)  return diff < 0 ? 'Ahead, to your left' : 'Ahead, to your right';
  if (a <= 120) return diff < 0 ? 'To your left' : 'To your right';
  if (a <= 160) return diff < 0 ? 'Behind you, to the left' : 'Behind you, to the right';
  return 'Behind you — turn around';
}

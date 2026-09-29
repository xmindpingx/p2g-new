// places2go — Directions from a self-hosted OSRM server (OpenStreetMap data)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// OSRM (Open Source Routing Machine) is the standard open-source router for
// OpenStreetMap. Its HTTP API:
//   GET {base}/route/v1/{profile}/{lon},{lat};{lon},{lat}
//       ?overview=full&geometries=geojson&steps=true
//
// appSettings.routingBaseUrl defaults to http://localhost:8098, which is the
// self-hosted OSRM instance defined in server/osrm/docker-compose.yml.
// That compose file builds both the car and foot profiles from the Arizona
// OpenStreetMap extract. Start it with:
//   cd server/osrm && docker compose --profile preprocess up  (first time)
//   docker compose up -d                                       (daily start)
// From a phone on the LAN, replace localhost with this machine's IP address.
//
// Distances and durations shown in the app are exactly what the server
// returns; nothing is estimated locally.

export class RoutingError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name   = 'RoutingError';
    this.status = status;
    this.cause  = cause;
  }
}

export const ROUTE_MODES = {
  WALKING: 'walking',
  DRIVING: 'driving',
};

// OSRM profile names per mode. The self-hosted compose file builds both:
//   car profile  → /route/v1/driving/…  (nginx routes → osrm-car:5000)
//   foot profile → /route/v1/foot/…     (nginx routes → osrm-foot:5001)
const OSRM_PROFILE = {
  [ROUTE_MODES.WALKING]: 'foot',
  [ROUTE_MODES.DRIVING]: 'driving',
};

export const isRoutingConfigured = (appSettings) =>
  !!appSettings?.routingEnabled
  && typeof appSettings.routingBaseUrl === 'string'
  && /^https?:\/\//i.test(appSettings.routingBaseUrl.trim());

export const isPublicDemoRouter = (appSettings) =>
  /router\.project-osrm\.org/i.test(appSettings?.routingBaseUrl || '');

/**
 * fetchRoute(appSettings, { from, to, mode, signal })
 *   from/to — { latitude, longitude }
 * Resolves to {
 *   mode, profile, distanceMeters, durationSeconds,
 *   coordinates: [{ latitude, longitude }],       // for a Polyline
 *   steps: [{ instruction, name, distanceMeters, durationSeconds, maneuver }],
 * }
 */
export async function fetchRoute(appSettings, { from, to, mode = ROUTE_MODES.WALKING, signal, timeoutMs = 12000 }) {
  if (!isRoutingConfigured(appSettings)) throw new RoutingError('Directions are turned off or the routing server URL is not set.');
  if (!from || !to) throw new RoutingError('Both a start and a destination are needed.');

  const profile = OSRM_PROFILE[mode] || OSRM_PROFILE[ROUTE_MODES.DRIVING];
  const base    = appSettings.routingBaseUrl.trim().replace(/\/$/, '');
  const coords  = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url     = `${base}/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=false`;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    let data = null;
    try { data = await response.json(); } catch (err) { data = null; }
    if (!response.ok || !data || data.code !== 'Ok') {
      const reason = data?.message || data?.code || `status ${response.status}`;
      throw new RoutingError(`Routing server could not find a route (${reason})`, { status: response.status });
    }
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) throw new RoutingError('Routing server returned an empty route');

    const steps = (route.legs || []).flatMap((leg) => (leg.steps || []).map((step) => ({
      instruction:     describeStep(step),
      name:            step.name || '',
      distanceMeters:  Math.round(step.distance),
      durationSeconds: Math.round(step.duration),
      maneuver:        step.maneuver?.type || null,
      modifier:        step.maneuver?.modifier || null,
    })));

    return {
      mode,
      profile,
      distanceMeters:  Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      coordinates:     route.geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
      steps,
      fetchedAt:       new Date().toISOString(),
      server:          base,
    };
  } catch (err) {
    if (err instanceof RoutingError) throw err;
    if (err.name === 'AbortError') throw new RoutingError('Routing server did not respond in time', { cause: err });
    throw new RoutingError('Could not reach the routing server', { cause: err });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Plain-English step text from OSRM's maneuver type/modifier.
function describeStep(step) {
  const type     = step.maneuver?.type || '';
  const modifier = step.maneuver?.modifier || '';
  const road     = step.name ? ` onto ${step.name}` : '';
  switch (type) {
    case 'depart':     return `Head ${modifier || 'out'}${step.name ? ` on ${step.name}` : ''}`;
    case 'arrive':     return 'Arrive at your destination';
    case 'turn':       return `Turn ${modifier}${road}`;
    case 'new name':   return `Continue${road}`;
    case 'continue':   return `Continue ${modifier || 'straight'}${road}`;
    case 'merge':      return `Merge ${modifier}${road}`;
    case 'on ramp':    return `Take the ramp${road}`;
    case 'off ramp':   return `Take the exit${road}`;
    case 'fork':       return `Keep ${modifier} at the fork${road}`;
    case 'end of road':return `At the end of the road turn ${modifier}${road}`;
    case 'roundabout':
    case 'rotary':     return `Enter the roundabout${step.maneuver?.exit ? ` and take exit ${step.maneuver.exit}` : ''}${road}`;
    case 'exit roundabout':
    case 'exit rotary':return `Exit the roundabout${road}`;
    default:           return `${type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Continue'}${modifier ? ` ${modifier}` : ''}${road}`;
  }
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatMeters(meters) {
  if (!Number.isFinite(meters)) return '';
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

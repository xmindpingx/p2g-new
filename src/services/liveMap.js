// places2go — Live map (opt-in location sharing) client
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Users who turn on "Share my location" in Profile post a COARSENED position
// to your server every liveMapUpdateIntervalSeconds and fetch other sharers
// nearby. Nobody's exact position leaves the device: coordinates are rounded
// to liveMapCoarsenDecimals (3 ≈ 110 m). Positions are anonymous — the server
// returns an opaque id, never a name.
//
// Server contract (implemented by server/stripe-server.example.js):
//   POST /live/positions        body { userId, lat, lon, at }          → 200 { ok: true }
//   DELETE /live/positions      body { userId }                        → 200 { ok: true }
//   GET  /live/positions?lat=&lon=&radiusKm=&exclude=<userId>          → 200 { positions: [{ id, lat, lon, at }] }

export class LiveMapError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name   = 'LiveMapError';
    this.status = status;
    this.cause  = cause;
  }
}

export const isLiveMapConfigured = (appSettings) =>
  !!appSettings?.liveMapEnabled
  && typeof appSettings.liveMapApiBaseUrl === 'string'
  && /^https?:\/\//i.test(appSettings.liveMapApiBaseUrl.trim());

/** coarsen(value, decimals) — round a coordinate before it leaves the device. */
export const coarsen = (value, decimals) => {
  const d = Number.isInteger(decimals) ? Math.min(6, Math.max(0, decimals)) : 3;
  const f = 10 ** d;
  return Math.round(value * f) / f;
};

const base = (appSettings) => appSettings.liveMapApiBaseUrl.trim().replace(/\/$/, '');

async function request(appSettings, path, { method = 'GET', body, timeoutMs = 8000 } = {}) {
  if (!isLiveMapConfigured(appSettings)) throw new LiveMapError('Live map is not enabled or its server URL is not set.');
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base(appSettings)}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    body ? JSON.stringify(body) : undefined,
      signal:  controller.signal,
    });
    let data = null;
    try { data = await response.json(); } catch (err) { data = null; }
    if (!response.ok) throw new LiveMapError(data?.error || `Live map server responded with status ${response.status}`, { status: response.status });
    return data;
  } catch (err) {
    if (err instanceof LiveMapError) throw err;
    if (err.name === 'AbortError') throw new LiveMapError('Live map server did not respond in time', { cause: err });
    throw new LiveMapError('Could not reach the live map server', { cause: err });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function postMyPosition(appSettings, { userId, latitude, longitude }) {
  const d = appSettings.liveMapCoarsenDecimals;
  return request(appSettings, '/live/positions', {
    method: 'POST',
    body:   { userId, lat: coarsen(latitude, d), lon: coarsen(longitude, d), at: Date.now() },
  });
}

export async function removeMyPosition(appSettings, { userId }) {
  return request(appSettings, '/live/positions', { method: 'DELETE', body: { userId } });
}

export async function fetchNearbyPositions(appSettings, { userId, latitude, longitude }) {
  const params = new URLSearchParams({
    lat:      String(latitude),
    lon:      String(longitude),
    radiusKm: String(appSettings.liveMapRadiusKm),
    exclude:  userId,
  });
  const data = await request(appSettings, `/live/positions?${params.toString()}`);
  const staleMs = appSettings.liveMapStaleAfterSeconds * 1000;
  const now = Date.now();
  return (data?.positions || []).filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.at) && now - p.at <= staleMs,
  );
}

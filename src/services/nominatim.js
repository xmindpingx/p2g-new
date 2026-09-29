// places2go — OpenStreetMap Nominatim service
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Free, keyless forward + reverse geocoding.
//
// Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/):
//   • Maximum 1 request per second  → enforced below with a serial throttle
//   • A valid identifying User-Agent → set NOMINATIM_USER_AGENT to include a real
//     contact address before shipping; the OSM policy requires it
//   • No bulk / heavy use            → this app only issues user-initiated lookups

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

// Replace the contact placeholder with a real email or URL before release.
export const NOMINATIM_USER_AGENT = 'places2go/1.0 (replace-with-your-contact-email)';

const MIN_REQUEST_INTERVAL_MS = 1100; // slightly above the 1 req/s policy limit
const DEFAULT_TIMEOUT_MS      = 8000;

export class NominatimError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name   = 'NominatimError';
    this.status = status;
    this.cause  = cause;
  }
}

// ---------------------------------------------------------------------------
// Serial throttle — guarantees requests are spaced ≥ MIN_REQUEST_INTERVAL_MS
// even when several callers fire at once.
// ---------------------------------------------------------------------------
let lastRequestAt = 0;
let chain = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function schedule(task) {
  const run = async () => {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return task();
  };
  const result = chain.then(run, run);
  chain = result.catch(() => {}); // keep the chain alive after a failure
  return result;
}

async function request(path, params, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = new URL(`${NOMINATIM_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return schedule(async () => {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept':          'application/json',
          'Accept-Language': 'en',
          'User-Agent':      NOMINATIM_USER_AGENT,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new NominatimError(`Nominatim responded with status ${response.status}`, {
          status: response.status,
        });
      }
      return await response.json();
    } catch (err) {
      if (err instanceof NominatimError) throw err;
      if (err.name === 'AbortError') {
        throw new NominatimError('Address lookup timed out', { cause: err });
      }
      throw new NominatimError('Address lookup failed', { cause: err });
    } finally {
      clearTimeout(timeoutId);
    }
  });
}

// ---------------------------------------------------------------------------
// Result normalisation
// ---------------------------------------------------------------------------
function normalizeAddress(raw = {}) {
  return {
    houseNumber:  raw.house_number || null,
    road:         raw.road || null,
    neighborhood: raw.neighbourhood || raw.suburb || null,
    city:         raw.city || raw.town || raw.village || raw.hamlet || raw.municipality || null,
    county:       raw.county || null,
    state:        raw.state || null,
    postcode:     raw.postcode || null,
    country:      raw.country || null,
    countryCode:  raw.country_code ? raw.country_code.toUpperCase() : null,
  };
}

function formatStreetAddress(address) {
  const street = [address.houseNumber, address.road].filter(Boolean).join(' ');
  const locality = [address.city, address.state].filter(Boolean).join(', ');
  return [street, locality, address.postcode].filter(Boolean).join(', ');
}

export function normalizeResult(raw) {
  const address = normalizeAddress(raw.address);
  return {
    id:               String(raw.place_id),
    osmType:          raw.osm_type || null,
    osmId:            raw.osm_id != null ? String(raw.osm_id) : null,
    name:             raw.name || raw.namedetails?.name || null,
    displayName:      raw.display_name || '',
    formattedAddress: formatStreetAddress(address) || raw.display_name || '',
    latitude:         parseFloat(raw.lat),
    longitude:        parseFloat(raw.lon),
    category:         raw.category || raw.class || null,
    type:             raw.type || null,
    address,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * searchAddress(query, options)
 *   options.limit        — max results (default 5)
 *   options.near         — { latitude, longitude } to bias (not restrict) results
 *   options.countryCodes — e.g. 'us' or 'us,ca' to restrict results
 *   options.signal       — AbortSignal
 * Resolves to an array of normalised results (may be empty).
 */
export async function searchAddress(
  query,
  { limit = 5, near = null, countryCodes = null, signal } = {},
) {
  const q = (query || '').trim();
  if (!q) return [];

  const params = {
    q,
    format:         'jsonv2',
    addressdetails: 1,
    namedetails:    1,
    limit,
    countrycodes:   countryCodes,
  };

  if (near && Number.isFinite(near.latitude) && Number.isFinite(near.longitude)) {
    const span = 0.5; // degrees; a soft bias box around the user
    params.viewbox = [
      near.longitude - span,
      near.latitude  + span,
      near.longitude + span,
      near.latitude  - span,
    ].join(',');
    params.bounded = 0; // bias only — results outside the box are still returned
  }

  const data = await request('/search', params, { signal });
  return Array.isArray(data) ? data.map(normalizeResult) : [];
}

/**
 * reverseGeocode(latitude, longitude, options)
 * Resolves to one normalised result, or null when nothing is found.
 */
export async function reverseGeocode(latitude, longitude, { signal } = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const data = await request(
    '/reverse',
    { lat: latitude, lon: longitude, format: 'jsonv2', addressdetails: 1, namedetails: 1 },
    { signal },
  );
  if (!data || data.error) return null;
  return normalizeResult(data);
}

// ---------------------------------------------------------------------------
// Business lookup (admin co-branding)
// ---------------------------------------------------------------------------
// OSM feature classes that describe a business or venue rather than a road,
// building outline, or administrative area. Used only to order candidates.
const BUSINESS_CATEGORIES = new Set([
  'amenity', 'shop', 'tourism', 'office', 'leisure', 'craft', 'healthcare',
]);

const firstTag = (tags, keys) => {
  for (const key of keys) {
    const value = tags?.[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
};

/**
 * normalizeBusinessResult(raw, source)
 * normalizeResult() plus the contact / hours / toilets tags OpenStreetMap
 * holds in `extratags`. Every field is null when OSM has no such tag — nothing
 * is inferred or filled in.
 */
export function normalizeBusinessResult(raw, source) {
  const base = normalizeResult(raw);
  const tags = raw.extratags || {};
  return {
    ...base,
    source,                                   // 'name_search' | 'at_pin'
    isBusinessFeature: BUSINESS_CATEGORIES.has(base.category),
    business: {
      website:          firstTag(tags, ['website', 'contact:website', 'url']),
      phone:            firstTag(tags, ['phone', 'contact:phone']),
      email:            firstTag(tags, ['email', 'contact:email']),
      openingHours:     firstTag(tags, ['opening_hours']),
      operator:         firstTag(tags, ['operator']),
      brand:            firstTag(tags, ['brand']),
      cuisine:          firstTag(tags, ['cuisine']),
      wheelchair:       firstTag(tags, ['wheelchair']),
      toilets:          firstTag(tags, ['toilets']),           // yes / no / customers
      toiletsAccess:    firstTag(tags, ['toilets:access']),
      toiletsWheelchair:firstTag(tags, ['toilets:wheelchair']),
    },
  };
}

/**
 * lookupBusiness({ latitude, longitude, name, signal })
 *
 * Two throttled requests:
 *   1. /search for `name` bounded to a small box around the pin (when a name
 *      is given) — finds the named business feature if OSM has one.
 *   2. /reverse at the pin with zoom 18 — whatever OSM feature sits there.
 *
 * Resolves to { candidates, fetchedAt, warnings }. Candidates are de-duplicated
 * by OSM id and ordered business features first. `warnings` lists any step that
 * failed so the admin can see that part of the lookup did not complete.
 */
export async function lookupBusiness({ latitude, longitude, name = '', signal } = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new NominatimError('Business lookup needs the place coordinates');
  }

  const candidates = [];
  const warnings   = [];
  const seen       = new Set();

  const push = (raw, source) => {
    if (!raw || raw.error) return;
    const item = normalizeBusinessResult(raw, source);
    const key  = item.osmType && item.osmId ? `${item.osmType}/${item.osmId}` : item.id;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(item);
  };

  const q = (name || '').trim();
  if (q) {
    const span = 0.01; // ≈ 1.1 km of latitude; bounded so only nearby matches return
    try {
      const results = await request(
        '/search',
        {
          q,
          format:         'jsonv2',
          addressdetails: 1,
          namedetails:    1,
          extratags:      1,
          limit:          3,
          viewbox:        [longitude - span, latitude + span, longitude + span, latitude - span].join(','),
          bounded:        1,
        },
        { signal },
      );
      if (Array.isArray(results)) results.forEach((r) => push(r, 'name_search'));
    } catch (err) {
      warnings.push(`Name search failed: ${err.message}`);
    }
  }

  try {
    const atPin = await request(
      '/reverse',
      { lat: latitude, lon: longitude, format: 'jsonv2', zoom: 18, addressdetails: 1, namedetails: 1, extratags: 1 },
      { signal },
    );
    push(atPin, 'at_pin');
  } catch (err) {
    warnings.push(`Lookup at the pin failed: ${err.message}`);
  }

  candidates.sort((a, b) => Number(b.isBusinessFeature) - Number(a.isBusinessFeature));

  return { candidates, fetchedAt: new Date().toISOString(), warnings };
}

// places2go — Nearby business discovery (OpenStreetMap Overpass API)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Keyless. Returns real named businesses inside a radius, with the tags
// OpenStreetMap actually holds for each (category, cuisine, brand, hours,
// phone, website, email, wheelchair, toilets). Nothing is inferred beyond
// the transparent fit points computed in scoreProspect(); a field OSM does not
// have is null. The public Overpass servers are for light use: one query per
// tap, 25 s server timeout. places2go is set up for your own instance
// (server/overpass/docker-compose.yml); the public servers reject some clients
// with 406 and are not meant for an app to depend on.

import { PROSPECT_CATEGORIES, OSM_VALUE_LABELS, MAX_PROSPECTS } from '../constants/partners';
import { distanceMeters } from '../utils/geo';

export class OverpassError extends Error {
  constructor(message, { status = null, cause = null } = {}) { super(message); this.name = 'OverpassError'; this.status = status; this.cause = cause; }
}

const tagStr = (tags, keys) => { for (const k of keys) { const v = tags?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return null; };
const humanize = (v) => v.replace(/_/g, ' ');

function buildQuery({ latitude, longitude, radiusMeters, categoryKeys }) {
  const clauses = [];
  for (const key of categoryKeys) {
    const cat = PROSPECT_CATEGORIES[key];
    if (!cat) continue;
    for (const [osmKey, values] of Object.entries(cat.filters)) {
      clauses.push(`nwr(around:${Math.round(radiusMeters)},${latitude},${longitude})["${osmKey}"~"^(${values.join('|')})$"]["name"];`);
    }
  }
  if (clauses.length === 0) throw new OverpassError('Choose at least one business category');
  return `[out:json][timeout:25];(${clauses.join('')});out center tags ${MAX_PROSPECTS * 3};`;
}

/** Normalise one Overpass element. */
export function normalizeElement(el) {
  const tags = el.tags || {};
  const latitude  = el.lat ?? el.center?.lat;
  const longitude = el.lon ?? el.center?.lon;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !tags.name) return null;

  const osmValue = tags.amenity || tags.shop || tags.leisure || null;
  const addr = [tagStr(tags, ['addr:housenumber']), tagStr(tags, ['addr:street'])].filter(Boolean).join(' ');
  const city = [tagStr(tags, ['addr:city']), tagStr(tags, ['addr:state'])].filter(Boolean).join(', ');
  const cuisines = tagStr(tags, ['cuisine']) ? tags.cuisine.split(';').map((c) => humanize(c.trim())).filter(Boolean) : [];
  return {
    id:           `${el.type}/${el.id}`,
    osmType:      el.type,
    osmId:        el.id,
    name:         tags.name.trim(),
    brand:        tagStr(tags, ['brand', 'operator']),
    category:     osmValue,
    categoryLabel: osmValue ? (OSM_VALUE_LABELS[osmValue] || humanize(osmValue)) : 'business',
    cuisines,
    address:      [addr, city].filter(Boolean).join(', '),
    latitude,
    longitude,
    phone:        tagStr(tags, ['contact:phone', 'phone']),
    email:        tagStr(tags, ['contact:email', 'email']),
    website:      tagStr(tags, ['contact:website', 'website']),
    openingHours: tagStr(tags, ['opening_hours']),
    wheelchair:   tagStr(tags, ['wheelchair']),
    toilets:      tagStr(tags, ['toilets']),               // yes | no | customers
    toiletsAccess: tagStr(tags, ['toilets:access']),
    toiletsWheelchair: tagStr(tags, ['toilets:wheelchair']),
    fetchedAt:    new Date().toISOString(),
  };
}

/**
 * scoreProspect(p, { existingPlaces }) → { points, reasons: string[], onMap: place|null }
 * Transparent rules, not a probability. Higher = better fit to approach first.
 */
export function scoreProspect(p, { existingPlaces = [] } = {}) {
  const reasons = [];
  let points = 0;
  const add = (n, why) => { points += n; reasons.push(`${n > 0 ? '+' : ''}${n} ${why}`); };

  if (p.toilets === 'yes' || p.toilets === 'customers') add(3, `OpenStreetMap lists toilets (${p.toilets})`);
  else if (p.toilets === 'no') add(-3, 'OpenStreetMap says no toilets');
  if (p.toiletsAccess === 'public' || p.toiletsAccess === 'yes') add(1, 'toilets marked public');
  if (p.wheelchair === 'yes' || p.toiletsWheelchair === 'yes') add(1, 'wheelchair accessible');
  if (['fuel', 'supermarket', 'department_store', 'mall', 'food_court', 'cafe', 'fast_food', 'restaurant'].includes(p.category)) add(2, `${p.categoryLabel}s usually have a restroom and steady foot traffic`);
  if (p.email) add(2, 'has an email address on record');
  else if (p.phone || p.website) add(1, 'has a phone or website on record');
  if (p.openingHours) add(1, 'has published opening hours');
  if (p.brand) add(-1, `part of a chain (${p.brand}) — contact is usually corporate`);

  const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const onMap = existingPlaces.find((pl) => {
    if (norm(pl.name) !== norm(p.name)) return false;
    const d = distanceMeters({ latitude: pl.latitude, longitude: pl.longitude }, { latitude: p.latitude, longitude: p.longitude });
    return d !== null && d <= 60;
  }) || null;
  return { points, reasons, onMap };
}

/**
 * findBusinesses({ latitude, longitude, radiusMiles, categoryKeys, baseUrl, signal })
 * Resolves to normalised businesses (unscored), closest first, capped.
 */
export async function findBusinesses({ latitude, longitude, radiusMiles = 1, categoryKeys, baseUrl, signal }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new OverpassError('A location is needed to search');
  const url = (baseUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new OverpassError('Set the OpenStreetMap Business Search URL in Admin Settings');
  const query = buildQuery({ latitude, longitude, radiusMeters: radiusMiles * 1609.344, categoryKeys });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}`, signal: controller.signal });
    if (!res.ok) throw new OverpassError(`Business search responded with status ${res.status}${res.status === 429 || res.status === 504 ? ' — the public server is busy, try again in a minute' : ''}`, { status: res.status });
    const data = await res.json();
    const seen = new Set();
    const list = [];
    for (const el of data.elements || []) {
      const n = normalizeElement(el);
      if (!n || seen.has(n.id)) continue;
      seen.add(n.id);
      list.push({ ...n, distanceMeters: Math.round(distanceMeters({ latitude, longitude }, { latitude: n.latitude, longitude: n.longitude })) });
    }
    list.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return list.slice(0, MAX_PROSPECTS);
  } catch (err) {
    if (err instanceof OverpassError) throw err;
    if (err.name === 'AbortError') throw new OverpassError('Business search timed out');
    throw new OverpassError(`Could not reach the business search server: ${err.message}`, { cause: err });
  } finally {
    clearTimeout(timeoutId);
  }
}

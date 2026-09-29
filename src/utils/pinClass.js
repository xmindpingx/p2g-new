// places2go — Pin classification (pure)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Decides which colour a place's map pin gets, from the requested scheme:
//   black  — no restroom on site (report reason "none_on_site")
//   red    — restroom exists but is not open to the public (report reason "not_public")
//   orange — flagged unsafe: at least pinUnsafeMinReports reviews said "felt unsafe"
//   yellow — low rated: average rating below pinLowRatingMax
//   gold   — best-rated restroom within pinBestRadiusMiles of the user (one place)
//   silver — highly rated: average at or above pinNiceRatingMin
//   green  — purchase required (amenity requiresPurchase)
//   blue   — everything else: a normal, usable restroom
// Priority runs top to bottom, so a place that is both unsafe and highly rated
// shows orange. Thresholds come from Admin Settings.

import { pinColors } from '../theme';
import { distanceMiles } from './geo';

export const PIN_CLASS = {
  NONE_ON_SITE: 'noneOnSite',
  NOT_PUBLIC:   'notPublic',
  UNSAFE:       'unsafe',
  LOW_RATED:    'lowRated',
  BEST:         'best',
  NICE:         'nice',
  PURCHASE:     'purchase',
  NORMAL:       'normal',
};

export const PIN_CLASS_LABELS = {
  [PIN_CLASS.NONE_ON_SITE]: 'No restroom on site',
  [PIN_CLASS.NOT_PUBLIC]:   'Not open to the public',
  [PIN_CLASS.UNSAFE]:       'Flagged unsafe by visitors',
  [PIN_CLASS.LOW_RATED]:    'Low rated',
  [PIN_CLASS.BEST]:         'Best rated near you',
  [PIN_CLASS.NICE]:         'Highly rated',
  [PIN_CLASS.PURCHASE]:     'Purchase required',
  [PIN_CLASS.NORMAL]:       'Free public restroom',
};

export const PIN_CLASS_ORDER = [
  PIN_CLASS.BEST, PIN_CLASS.NICE, PIN_CLASS.NORMAL, PIN_CLASS.PURCHASE,
  PIN_CLASS.LOW_RATED, PIN_CLASS.UNSAFE, PIN_CLASS.NOT_PUBLIC, PIN_CLASS.NONE_ON_SITE,
];

export const pinColorFor = (pinClass) => pinColors[pinClass] || pinColors.normal;

/**
 * countUnsafeReports(reviews) → { [placeId]: n } of reviews marked feltUnsafe.
 */
export function countUnsafeReports(reviews = []) {
  const out = {};
  for (const r of reviews) if (r.feltUnsafe === true) out[r.placeId] = (out[r.placeId] || 0) + 1;
  return out;
}

/**
 * findBestPlaceId(places, { ratingIndex, userLocation, settings })
 * The single best-rated usable restroom within pinBestRadiusMiles of the user,
 * with at least pinBestMinReviews reviews. Ties → more reviews → closer.
 * Null when there is no user location or no candidate.
 */
export function findBestPlaceId(places = [], { ratingIndex = {}, unsafeCounts = {}, userLocation = null, settings }) {
  if (!userLocation) return null;
  let best = null;
  for (const p of places) {
    if (p.hasPublicRestroom === false) continue;
    // Never crown a place visitors flagged unsafe or rated low
    if (settings.pinUnsafeMinReports > 0 && (unsafeCounts[p.id] || 0) >= settings.pinUnsafeMinReports) continue;
    const r = ratingIndex[p.id];
    if (!r || r.count < settings.pinBestMinReviews) continue;
    if (r.average < settings.pinLowRatingMax) continue;
    const d = distanceMiles(userLocation, p);
    if (d === null || d > settings.pinBestRadiusMiles) continue;
    if (!best || r.average > best.average || (r.average === best.average && (r.count > best.count || (r.count === best.count && d < best.d)))) {
      best = { id: p.id, average: r.average, count: r.count, d };
    }
  }
  return best ? best.id : null;
}

/**
 * classifyPin(place, { ratingIndex, unsafeCounts, bestPlaceId, settings }) → PIN_CLASS
 */
export function classifyPin(place, { ratingIndex = {}, unsafeCounts = {}, bestPlaceId = null, settings }) {
  if (place.hasPublicRestroom === false) {
    return place.noRestroomReason === 'not_public' ? PIN_CLASS.NOT_PUBLIC : PIN_CLASS.NONE_ON_SITE;
  }
  const rating = ratingIndex[place.id] || null;
  if ((unsafeCounts[place.id] || 0) >= settings.pinUnsafeMinReports && settings.pinUnsafeMinReports > 0) return PIN_CLASS.UNSAFE;
  if (rating && rating.count > 0 && rating.average < settings.pinLowRatingMax) return PIN_CLASS.LOW_RATED;
  if (bestPlaceId && place.id === bestPlaceId) return PIN_CLASS.BEST;
  if (rating && rating.count >= settings.pinBestMinReviews && rating.average >= settings.pinNiceRatingMin) return PIN_CLASS.NICE;
  if (place.amenities?.requiresPurchase === true) return PIN_CLASS.PURCHASE;
  return PIN_CLASS.NORMAL;
}

/**
 * buildPinClassIndex(places, { reviews, ratingIndex, userLocation, settings }) → { [placeId]: PIN_CLASS }
 */
export function buildPinClassIndex(places = [], { reviews = [], ratingIndex = {}, userLocation = null, settings }) {
  const unsafeCounts = countUnsafeReports(reviews);
  const bestPlaceId  = findBestPlaceId(places, { ratingIndex, unsafeCounts, userLocation, settings });
  const index = {};
  for (const p of places) index[p.id] = classifyPin(p, { ratingIndex, unsafeCounts, bestPlaceId, settings });
  return index;
}

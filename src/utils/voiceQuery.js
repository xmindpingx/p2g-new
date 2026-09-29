// places2go — Hands-free query parsing (rule based, on device)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Turns a spoken request such as
//   "closest restroom with a changing table and at least four stars"
//   "nearest free bathroom that's open now"
//   "find a clean accessible place I rated"
//   "directions, walking"
// into filters the existing place pipeline can run. No network, no model:
// amenity words are matched against the live amenity labels plus the alias
// table below, ratings against spoken numbers. What the parser understood is
// shown to the user before results, so nothing is applied silently.

import { distanceMiles, formatDistance, bearingDegrees, compassPoint, COMPASS_POINT_NAMES } from './geo';
import { buildRatingIndex, decoratePlaces, isPubliclyListed } from './places';
import { isAccessiblePlace, isFamilyFriendlyPlace } from '../constants/filters';

export const VOICE_INTENT = {
  FIND:       'find',
  DIRECTIONS: 'directions',
  CANCEL:     'cancel',
  REPEAT:     'repeat',
  UNKNOWN:    'unknown',
};

// Spoken phrases → amenity keys (in addition to matching the label text itself)
const AMENITY_ALIASES = {
  hasChangingStation:     ['changing table', 'changing station', 'baby changing', 'diaper'],
  hasFamilyRoom:          ['family room', 'family restroom', 'family bathroom'],
  hasNursingArea:         ['nursing', 'breastfeeding', 'lactation'],
  hasKidSizedToilet:      ['kid sized', 'kids toilet', 'child toilet', 'kid toilet'],
  hasWheelchairStall:     ['wheelchair', 'handicap', 'handicapped', 'ada'],
  hasGrabBars:            ['grab bars', 'grab bar', 'handrails'],
  hasStepFreeEntry:       ['step free', 'no steps', 'ramp'],
  hasAutoDoor:            ['automatic door', 'auto door', 'push button door'],
  hasLowSink:             ['low sink'],
  hasBrailleSignage:      ['braille'],
  isGenderNeutral:        ['gender neutral', 'all gender', 'unisex'],
  isSingleOccupancy:      ['single stall', 'single occupancy', 'private', 'one person'],
  isMultiStall:           ['multi stall', 'multiple stalls', 'several stalls'],
  hasMensRoom:            ["men's room", 'mens room', "men's", 'mens'],
  hasWomensRoom:          ["women's room", 'womens room', "women's", 'womens', 'ladies'],
  isClean:                ['clean', 'spotless', 'tidy'],
  isWellMaintained:       ['well maintained', 'maintained'],
  isFree:                 ['free', 'no charge', "doesn't cost", 'no purchase'],
  requiresKey:            ['key required', 'needs a key', 'with a key'],
  requiresPurchase:       ['purchase required', 'have to buy', 'need to buy'],
  isOpen24Hours:          ['24 hours', 'twenty four hours', 'all night', 'overnight', 'twenty-four hours'],
  isIndoor:               ['indoor', 'inside'],
  isWellLit:              ['well lit', 'well-lit', 'good lighting', 'lit'],
  isSafe:                 ['safe'],
  isEasyToFind:           ['easy to find'],
  isEasyToAccess:         ['easy to access', 'easy access'],
  isOnGroundFloor:        ['ground floor', 'first floor', 'no stairs'],
  hasSoap:                ['soap'],
  hasHotWater:            ['hot water', 'warm water'],
  hasPaperTowels:         ['paper towels', 'paper towel'],
  hasHandDryer:           ['hand dryer', 'dryer'],
  hasToiletPaper:         ['toilet paper', 'tp'],
  hasSeatCovers:          ['seat covers', 'seat cover'],
  hasFeminineDisposal:    ['feminine disposal', 'sanitary bin'],
  hasFemininePad:         ['pads', 'pad dispenser', 'feminine products', 'period products'],
  hasBabyWipes:           ['baby wipes', 'wipes'],
  hasAirFreshener:        ['air freshener', 'smells good', 'fresh'],
  vendingCondoms:         ['condom', 'condoms'],
  vendingFeminineProducts:['tampon', 'tampons', 'feminine vending'],
  vendingSnacks:          ['snacks', 'snack machine', 'vending snacks'],
};

// Phrases that mean "the composite Accessible / Family filter" rather than one key
const COMPOSITE_ALIASES = {
  accessible: ['accessible', 'accessibility', 'disabled access'],
  family:     ['family friendly', 'family-friendly', 'with kids', 'for kids', 'with a baby', 'with my baby'],
};

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, 'four and a half': 4.5, 'three and a half': 3.5 };

const normalize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9.' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const containsPhrase = (text, phrase) => new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(text);

/**
 * parseVoiceQuery(transcript, { officialAmenities })
 * → { intent, filters: { minRating, amenityKeys, accessible, family, openNow, ratedByMe, negatedKeys }, sort, mode, understood: [] }
 */
export function parseVoiceQuery(transcript, { officialAmenities = [] } = {}) {
  const text = normalize(transcript);
  const understood = [];

  if (!text) return { intent: VOICE_INTENT.UNKNOWN, text, filters: null, sort: 'distance', mode: null, understood };

  if (/\b(cancel|never mind|nevermind|stop|forget it)\b/.test(text)) {
    return { intent: VOICE_INTENT.CANCEL, text, filters: null, sort: 'distance', mode: null, understood: ['Cancel'] };
  }
  if (/\b(repeat|say that again|again)\b/.test(text) && text.split(' ').length <= 4) {
    return { intent: VOICE_INTENT.REPEAT, text, filters: null, sort: 'distance', mode: null, understood: ['Repeat'] };
  }

  const wantsDirections = /\b(directions|navigate|navigation|take me|guide me|route|go there|let's go|lets go)\b/.test(text);
  let mode = null;
  if (/\b(walk|walking|on foot|by foot)\b/.test(text)) mode = 'walking';
  if (/\b(drive|driving|by car|car)\b/.test(text))     mode = 'driving';

  // Pure follow-up command ("directions", "walk", "drive there")
  const hasSearchWords = /\b(find|closest|nearest|near|nearby|place|restroom|bathroom|toilet|with|that|rated|star|stars|open|free|clean)\b/.test(text);
  if ((wantsDirections || mode) && !hasSearchWords) {
    understood.push(mode ? `Directions — ${mode}` : 'Directions');
    return { intent: VOICE_INTENT.DIRECTIONS, text, filters: null, sort: 'distance', mode, understood };
  }

  const filters = { minRating: null, amenityKeys: [], negatedKeys: [], accessible: false, family: false, openNow: false, ratedByMe: false };

  // Rating: "at least 4 stars", "4 star", "four stars or better", "rated 4.5 or higher", "highly rated", "top rated"
  const ratingMatch = text.match(/\b(\d(?:\.\d)?|one|two|three|four|five|four and a half|three and a half)\s*(?:stars?|star rating)\b/);
  if (ratingMatch) {
    const raw = ratingMatch[1];
    const n = NUMBER_WORDS[raw] ?? parseFloat(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 5) { filters.minRating = n; understood.push(`${n}+ stars`); }
  } else if (/\b(highly rated|well rated|good rating|good reviews|great reviews)\b/.test(text)) {
    filters.minRating = 4; understood.push('4+ stars');
  }
  let sort = 'distance';
  if (/\b(top rated|best rated|highest rated|best)\b/.test(text)) { sort = 'rating'; understood.push('Sorted by rating'); }
  if (/\b(closest|nearest|near me|nearby|close by|around here)\b/.test(text)) { sort = sort === 'rating' ? 'rating' : 'distance'; understood.push('Closest first'); }

  if (/\b(open now|that's open|thats open|is open|open right now|currently open|open)\b/.test(text)) { filters.openNow = true; understood.push('Open now'); }
  if (/\b(i rated|i've rated|i reviewed|i've reviewed|my reviews|that i rated|i have rated|i have reviewed)\b/.test(text)) { filters.ratedByMe = true; understood.push('Places you rated'); }

  for (const phrase of COMPOSITE_ALIASES.accessible) if (containsPhrase(text, phrase)) { filters.accessible = true; }
  for (const phrase of COMPOSITE_ALIASES.family)     if (containsPhrase(text, phrase)) { filters.family = true; }
  if (filters.accessible) understood.push('Accessible');
  if (filters.family)     understood.push('Family friendly');

  // Negations: "no key", "without a key", "no purchase required"
  if (/\b(no key|without a key|without key|don't need a key|doesn't need a key)\b/.test(text)) { filters.negatedKeys.push('requiresKey'); understood.push('No key needed'); }
  if (/\b(no purchase|without buying|without a purchase|don't have to buy)\b/.test(text)) { filters.negatedKeys.push('requiresPurchase'); understood.push('No purchase needed'); }

  const labelByKey = {};
  for (const a of officialAmenities) if (a.isActive !== false) labelByKey[a.key] = a.label;

  const matched = new Set();
  // 1. alias table
  for (const [key, phrases] of Object.entries(AMENITY_ALIASES)) {
    if (filters.negatedKeys.includes(key)) continue;
    if (phrases.some((p) => containsPhrase(text, normalize(p)))) matched.add(key);
  }
  // 2. live labels (covers admin-added amenities): every word of the label appears
  for (const [key, label] of Object.entries(labelByKey)) {
    if (matched.has(key) || filters.negatedKeys.includes(key)) continue;
    const words = normalize(label).split(' ').filter((w) => w.length > 2);
    if (words.length && words.every((w) => containsPhrase(text, w))) matched.add(key);
  }
  // "free" also appears in "free of charge" etc.; "safe" is fine. Avoid "lit" false positives in "little".
  filters.amenityKeys = [...matched];
  for (const key of filters.amenityKeys) understood.push(labelByKey[key] || key);

  const intent = VOICE_INTENT.FIND;
  return { intent, text, filters, sort, mode, wantsDirections, understood };
}

/**
 * runVoiceQuery(parsed, { places, reviews, userLocation, currentUserId })
 * → { results: decorated places sorted by the parsed sort, total }
 * Results never include "no public restroom" reports or unlisted places.
 */
export function runVoiceQuery(parsed, { places = [], reviews = [], userLocation = null, currentUserId = null }) {
  if (!parsed?.filters) return { results: [], total: 0 };
  const { filters, sort } = parsed;
  const ratingIndex = buildRatingIndex(reviews);
  const decorated   = decoratePlaces(places, { userLocation, ratingIndex });
  const myRatedIds  = new Set(reviews.filter((r) => r.userId === currentUserId).map((r) => r.placeId));

  const results = decorated.filter((p) => {
    if (!isPubliclyListed(p) || p.hasPublicRestroom === false) return false;
    if (filters.openNow && p.isOpen !== true) return false;
    if (filters.ratedByMe && !myRatedIds.has(p.id)) return false;
    if (filters.minRating !== null && !(p.rating.count > 0 && p.rating.average >= filters.minRating)) return false;
    if (filters.accessible && !isAccessiblePlace(p)) return false;
    if (filters.family && !isFamilyFriendlyPlace(p)) return false;
    for (const key of filters.amenityKeys)  if (p.amenities?.[key] !== true) return false;
    for (const key of filters.negatedKeys)  if (p.amenities?.[key] === true) return false;
    return true;
  });

  results.sort((a, b) => {
    if (sort === 'rating') return b.rating.average - a.rating.average || b.rating.count - a.rating.count || (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity);
    return (Number.isFinite(a.distanceMi) ? a.distanceMi : Infinity) - (Number.isFinite(b.distanceMi) ? b.distanceMi : Infinity);
  });

  return { results, total: results.length };
}

/**
 * describeResult(place, { userLocation, officialAmenities, matchedKeys })
 * → sentence(s) to speak. Only facts present on the place are spoken.
 */
export function describeResult(place, { userLocation = null, officialAmenities = [], matchedKeys = [] } = {}) {
  if (!place) return 'I did not find a matching place.';
  const parts = [`The closest match is ${place.name}`];

  const miles = userLocation ? distanceMiles(userLocation, place) : null;
  if (Number.isFinite(miles)) {
    const label = formatDistance(miles);
    parts.push(label.startsWith('<') ? 'less than a tenth of a mile away' : `${label.replace(' mi', ' miles')} away`);
    const bearing = bearingDegrees(userLocation, place);
    const point   = compassPoint(bearing);
    if (point) parts.push(`to the ${COMPASS_POINT_NAMES[point] || point}`);
  }

  let sentence = `${parts.join(', ')}.`;
  if (place.rating?.count > 0) {
    sentence += ` It is rated ${place.rating.average.toFixed(1)} from ${place.rating.count} review${place.rating.count === 1 ? '' : 's'}.`;
  } else {
    sentence += ' It has no reviews yet.';
  }
  if (place.isOpen === true) sentence += ' It is marked open.';
  else if (place.isOpen === false) sentence += ' It is marked closed.';

  const labels = officialAmenities.filter((a) => matchedKeys.includes(a.key) && place.amenities?.[a.key] === true).map((a) => a.label);
  if (labels.length) sentence += ` It has ${labels.join(', ')}.`;

  sentence += ' Say "directions", "walk" or "drive" to go there.';
  return sentence;
}

export function describeNoResult(parsed) {
  const wanted = parsed?.understood?.length ? ` matching ${parsed.understood.join(', ').toLowerCase()}` : '';
  return `I did not find a place${wanted}. Try fewer requirements.`;
}

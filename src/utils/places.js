// places2go — Place list helpers
// Pure functions that turn store data into what the Map and Results screens render.

import { distanceMiles } from './geo';
import {
  FILTER_CHIP_BY_KEY,
  SORT_KEYS,
  isAccessiblePlace,
  isFamilyFriendlyPlace,
} from '../constants/filters';
import {
  getContentVisibility,
  CONTENT_VISIBILITY,
  UPLOAD_STATUS,
} from '../constants/moderation';

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------
/**
 * buildRatingIndex(reviews) → { [placeId]: { average, count } }
 * Ratings are numeric and are always counted; only text and photos are moderated.
 */
export function buildRatingIndex(reviews = []) {
  const totals = {};
  for (const review of reviews) {
    if (!Number.isFinite(review.rating)) continue;
    const entry = totals[review.placeId] || (totals[review.placeId] = { sum: 0, count: 0 });
    entry.sum   += review.rating;
    entry.count += 1;
  }
  const index = {};
  for (const [placeId, entry] of Object.entries(totals)) {
    index[placeId] = {
      average: Math.round((entry.sum / entry.count) * 10) / 10,
      count:   entry.count,
    };
  }
  return index;
}

export const EMPTY_RATING = Object.freeze({ average: 0, count: 0 });

// ---------------------------------------------------------------------------
// Decoration — attach distance + rating to each place for rendering
// ---------------------------------------------------------------------------
export function decoratePlaces(places = [], { userLocation = null, ratingIndex = {} } = {}) {
  return places.map((place) => ({
    ...place,
    distanceMi: userLocation ? distanceMiles(userLocation, place) : null,
    rating:     ratingIndex[place.id] || EMPTY_RATING,
  }));
}

// ---------------------------------------------------------------------------
// Text search
// ---------------------------------------------------------------------------
export function matchesQuery(place, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  const haystack = [place.name, place.address, place.placeType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------
/**
 * filterPlaces(decoratedPlaces, { activeChipKeys, query, userLocation })
 * Every active chip must pass. Unknown chip keys are ignored.
 */
export function filterPlaces(
  places = [],
  { activeChipKeys = [], query = '', userLocation = null } = {},
) {
  const context = { userLocation };
  const activeChips = activeChipKeys
    .map((key) => FILTER_CHIP_BY_KEY[key])
    .filter(Boolean);

  return places.filter(
    (place) =>
      matchesQuery(place, query) &&
      activeChips.every((chip) => chip.predicate(place, context)),
  );
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------
export function sortPlaces(places = [], sortKey = SORT_KEYS.DISTANCE) {
  const list = [...places];
  switch (sortKey) {
    case SORT_KEYS.DISTANCE:
      return list.sort(
        (a, b) =>
          (Number.isFinite(a.distanceMi) ? a.distanceMi : Infinity) -
          (Number.isFinite(b.distanceMi) ? b.distanceMi : Infinity),
      );
    case SORT_KEYS.RATING:
      return list.sort(
        (a, b) =>
          b.rating.average - a.rating.average ||
          b.rating.count   - a.rating.count,
      );
    case SORT_KEYS.REVIEWS:
      return list.sort(
        (a, b) =>
          b.rating.count   - a.rating.count ||
          b.rating.average - a.rating.average,
      );
    case SORT_KEYS.NEWEST:
      return list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    default:
      return list;
  }
}

// ---------------------------------------------------------------------------
// Photos — only uploaded AND moderation-visible photos are ever shown publicly
// ---------------------------------------------------------------------------
export function getVisiblePhotos(place, moderationQueue = [], appSettings) {
  if (!place?.photos?.length) return [];
  const queueById = {};
  for (const entry of moderationQueue) queueById[entry.id] = entry;

  return place.photos.filter((photo) => {
    if (photo.uploadStatus !== UPLOAD_STATUS.UPLOADED || !photo.uploadedUrl) return false;
    const entry = photo.moderationQueueId ? queueById[photo.moderationQueueId] : null;
    return getContentVisibility(entry, appSettings) === CONTENT_VISIBILITY.VISIBLE;
  });
}

export function primaryPhotoUri(place, moderationQueue, appSettings) {
  const visible = getVisiblePhotos(place, moderationQueue, appSettings);
  return visible.length ? visible[0].uploadedUrl : null;
}

/**
 * reviewTextVisibility(review, moderationQueue, appSettings)
 * Ratings always show; this decides whether the written text may be shown.
 * Seed reviews (no queue entry) are visible.
 */
export function reviewTextVisibility(review, moderationQueue = [], appSettings) {
  if (!review?.text) return CONTENT_VISIBILITY.VISIBLE;
  const entry = moderationQueue.find((e) => e.contentRef === review.id) || null;
  return getContentVisibility(entry, appSettings);
}

export function getVisibleReviewPhotos(review, moderationQueue = [], appSettings) {
  return getVisiblePhotos(review, moderationQueue, appSettings);
}

// ---------------------------------------------------------------------------
// Attribute summary — the short "Clean · Accessible" line on list rows
// ---------------------------------------------------------------------------
const ATTRIBUTE_SUMMARY_ORDER = [
  { label: 'Clean',             test: (p) => p.amenities?.isClean === true },
  { label: 'Accessible',        test: isAccessiblePlace },
  { label: 'Family Friendly',   test: isFamilyFriendlyPlace },
  { label: 'Gender Neutral',    test: (p) => p.amenities?.isGenderNeutral === true },
  { label: 'Single Stall',      test: (p) => p.amenities?.isSingleOccupancy === true },
  { label: '24 Hours',          test: (p) => p.amenities?.isOpen24Hours === true },
  { label: 'Key Required',      test: (p) => p.amenities?.requiresKey === true },
  { label: 'Purchase Required', test: (p) => p.amenities?.requiresPurchase === true },
  { label: 'Free',              test: (p) => p.amenities?.isFree === true },
];

export function summarizeAttributes(place, max = 2) {
  const labels = [];
  for (const attribute of ATTRIBUTE_SUMMARY_ORDER) {
    if (attribute.test(place)) labels.push(attribute.label);
    if (labels.length >= max) break;
  }
  return labels;
}

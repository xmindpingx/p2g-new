// places2go — Map filter chips & sort options
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Composes the map chips from amenities.js (single source of truth) plus a few
// fixed chips that are not single amenity keys (Nearby, Open Now, Accessible,
// Family). Every chip has a predicate(place, context) → boolean.

import { MAP_CHIP_AMENITIES } from './amenities';
import { distanceMiles } from '../utils/geo';

export const NEARBY_RADIUS_MILES = 5;

export const CHIP_KEYS = {
  NEARBY:       'nearby',
  OPEN_NOW:     'openNow',
  HAS_RESTROOM: 'hasRestroom',
  ACCESSIBLE:   'accessible',
  FAMILY:       'family',
};

// "Accessible" is true when ANY of these amenity keys is checked
export const ACCESSIBLE_AMENITY_KEYS = [
  'hasWheelchairStall',
  'hasStepFreeEntry',
  'hasGrabBars',
  'hasAutoDoor',
  'hasLowSink',
  'hasBrailleSignage',
];

// "Family" is true when ANY of these amenity keys is checked
export const FAMILY_AMENITY_KEYS = [
  'hasFamilyRoom',
  'hasChangingStation',
  'hasKidSizedToilet',
  'hasNursingArea',
];

export const hasAnyAmenity = (place, keys) =>
  keys.some((k) => place?.amenities?.[k] === true);

export const isAccessiblePlace     = (place) => hasAnyAmenity(place, ACCESSIBLE_AMENITY_KEYS);
export const isFamilyFriendlyPlace = (place) => hasAnyAmenity(place, FAMILY_AMENITY_KEYS);

// Shorter chip labels for amenity keys whose full label is too long for a pill
const MAP_CHIP_SHORT_LABELS = {
  isClean:  'Clean',
  isFree:   'Free',
  isIndoor: 'Indoor',
};

/**
 * FILTER_CHIPS — ordered list rendered on the Map and Results screens.
 * predicate(place, context) where context = { userLocation }.
 * `place.distanceMi` is present when the place has been decorated (utils/places.js).
 */
export const FILTER_CHIPS = [
  {
    key: CHIP_KEYS.NEARBY,
    label: 'Nearby',
    defaultActive: true,
    requiresLocation: true,
    predicate: (place, context) => {
      const userLocation = context?.userLocation;
      if (!userLocation) return true; // no location → chip is a no-op, never hides pins
      const d = Number.isFinite(place.distanceMi)
        ? place.distanceMi
        : distanceMiles(userLocation, place);
      return d === null ? true : d <= NEARBY_RADIUS_MILES;
    },
  },
  {
    key: CHIP_KEYS.OPEN_NOW,
    label: 'Open Now',
    defaultActive: false,
    requiresLocation: false,
    predicate: (place) => place.isOpen === true,
  },
  {
    // Hides "No public restroom" reports so only usable restrooms remain
    key: CHIP_KEYS.HAS_RESTROOM,
    label: 'Has Restroom',
    defaultActive: false,
    requiresLocation: false,
    predicate: (place) => place.hasPublicRestroom !== false,
  },
  {
    key: CHIP_KEYS.ACCESSIBLE,
    label: 'Accessible',
    defaultActive: false,
    requiresLocation: false,
    predicate: isAccessiblePlace,
  },
  {
    key: CHIP_KEYS.FAMILY,
    label: 'Family',
    defaultActive: false,
    requiresLocation: false,
    predicate: isFamilyFriendlyPlace,
  },
  ...MAP_CHIP_AMENITIES.map((amenity) => ({
    key: amenity.key,
    label: MAP_CHIP_SHORT_LABELS[amenity.key] || amenity.label,
    defaultActive: false,
    requiresLocation: false,
    predicate: (place) => place?.amenities?.[amenity.key] === true,
  })),
];

export const FILTER_CHIP_BY_KEY = FILTER_CHIPS.reduce((acc, chip) => {
  acc[chip.key] = chip;
  return acc;
}, {});

export const DEFAULT_ACTIVE_CHIP_KEYS = FILTER_CHIPS
  .filter((chip) => chip.defaultActive)
  .map((chip) => chip.key);

// ---------------------------------------------------------------------------
// Sort options (Results screen)
// ---------------------------------------------------------------------------
export const SORT_KEYS = {
  DISTANCE: 'distance',
  RATING:   'rating',
  REVIEWS:  'reviews',
  NEWEST:   'newest',
};

export const SORT_OPTIONS = [
  { key: SORT_KEYS.DISTANCE, label: 'Distance',      requiresLocation: true  },
  { key: SORT_KEYS.RATING,   label: 'Top Rated',     requiresLocation: false },
  { key: SORT_KEYS.REVIEWS,  label: 'Most Reviewed', requiresLocation: false },
  { key: SORT_KEYS.NEWEST,   label: 'Newest',        requiresLocation: false },
];

export const SORT_OPTION_BY_KEY = SORT_OPTIONS.reduce((acc, option) => {
  acc[option.key] = option;
  return acc;
}, {});

export const DEFAULT_SORT_KEY = SORT_KEYS.DISTANCE;

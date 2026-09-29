// places2go — Partner finder constants
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.

export const PROSPECT_STATUS = {
  NEW:        'new',
  DRAFTED:    'drafted',    // first-contact suggestions generated
  CONTACTED:  'contacted',
  ENROLLED:   'enrolled',   // the business enrolled its own restroom
  DECLINED:   'declined',   // never contact again
  DISMISSED:  'dismissed',  // not a fit; hidden from results
};

export const PROSPECT_STATUS_LABELS = {
  [PROSPECT_STATUS.NEW]:       'New',
  [PROSPECT_STATUS.DRAFTED]:   'Drafted',
  [PROSPECT_STATUS.CONTACTED]: 'Contacted',
  [PROSPECT_STATUS.ENROLLED]:  'Enrolled',
  [PROSPECT_STATUS.DECLINED]:  'Declined',
  [PROSPECT_STATUS.DISMISSED]: 'Dismissed',
};

// Search categories → OpenStreetMap tag filters (key → allowed values).
export const PROSPECT_CATEGORIES = {
  food:     { label: 'Coffee & food',        filters: { amenity: ['cafe', 'fast_food', 'restaurant', 'food_court', 'ice_cream'] } },
  fuel:     { label: 'Fuel & convenience',   filters: { amenity: ['fuel'], shop: ['convenience'] } },
  grocery:  { label: 'Grocery & retail',     filters: { shop: ['supermarket', 'department_store', 'mall', 'variety_store', 'bakery', 'clothes', 'hardware', 'books'] } },
  health:   { label: 'Pharmacy & health',    filters: { amenity: ['pharmacy'], shop: ['chemist'] } },
  leisure:  { label: 'Fitness & leisure',    filters: { leisure: ['fitness_centre', 'sports_centre', 'bowling_alley'], amenity: ['cinema'] } },
};
export const PROSPECT_CATEGORY_ORDER = ['food', 'fuel', 'grocery', 'health', 'leisure'];

export const SEARCH_RADIUS_OPTIONS_MILES = [0.5, 1, 2, 5];
export const MAX_PROSPECTS = 60;

// Human labels for the OSM category values we search
export const OSM_VALUE_LABELS = {
  cafe: 'café', fast_food: 'fast-food restaurant', restaurant: 'restaurant', food_court: 'food court', ice_cream: 'ice cream shop',
  fuel: 'fuel station', convenience: 'convenience store', supermarket: 'supermarket', department_store: 'department store',
  mall: 'shopping mall', variety_store: 'variety store', bakery: 'bakery', clothes: 'clothing store', hardware: 'hardware store',
  books: 'bookstore', pharmacy: 'pharmacy', chemist: 'drugstore', fitness_centre: 'fitness centre', sports_centre: 'sports centre',
  bowling_alley: 'bowling alley', cinema: 'cinema',
};

/** Incentive text for outreach, from settings. '' when the incentive is off. */
export function incentiveText(settings) {
  if (!settings?.partnerIncentiveEnabled) return '';
  const amount = Number(settings.partnerIncentiveAmountUSD);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const money = Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
  const target = (settings.partnerIncentiveAppliesTo || '').trim();
  return target ? `${money} off ${target}` : `${money} off`;
}

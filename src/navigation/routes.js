// places2go — Route name registry
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Fixed strings imported by every screen for navigation. Never hard-code a
// route name inside a screen file; import ROUTES from here.
// Lives outside App.js so screens can import it without a circular import.

export const ROUTES = {
  // ── Root stack ────────────────────────────────────────────────────────────
  SPLASH:          'Splash',
  TERMS:           'Terms',
  ONBOARDING:      'Onboarding',
  AUTH:            'Auth',
  MAIN_TABS:       'MainTabs',
  RESULTS:         'Results',
  PLACE_DETAILS:   'PlaceDetails',
  NAVIGATION:      'Navigation',
  RATE_REVIEW:     'RateReview',
  ADD_PLACE:       'AddPlace',
  FOR_BUSINESS:    'ForBusiness',
  BIGGER_PICTURE:  'BiggerPicture',
  DONATE:          'Donate',
  PAYOUT_METHOD:   'PayoutMethod',
  PAYOUT_HISTORY:  'PayoutHistory',
  LEGAL:           'Legal',        // read-only view of the terms from Profile

  // ── Tab roots ─────────────────────────────────────────────────────────────
  TAB_EXPLORE:     'Explore',
  TAB_SAVED:       'Saved',
  TAB_ADD:         'Add',        // press is intercepted → pushes ADD_PLACE
  TAB_ACTIVITY:    'Activity',
  TAB_PROFILE:     'Profile',

  // ── Admin / mod ───────────────────────────────────────────────────────────
  ADMIN_PANEL:     'AdminPanel',
  MOD_QUEUE:       'ModQueue',
  ADMIN_SETTINGS:  'AdminSettings',
  ADMIN_AMENITIES: 'AdminAmenities',

  // ── Admin only ────────────────────────────────────────────────────────────
  ADMIN_VERIFICATION: 'AdminVerification', // "no restroom" reports + payouts queue
  ADMIN_BUG_REPORTS:  'AdminBugReports',   // submitted bug reports + Ollama analysis
  COBRANDING:         'CoBranding',        // all places, partnership status
  COBRANDING_PLACE:   'CoBrandingPlace',   // one listing: lookup, templates, banner
  PARTNER_FINDER:     'PartnerFinder',     // find nearby businesses, first-contact suggestions
};

export default ROUTES;

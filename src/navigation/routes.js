// places2go — Route name registry
// Fixed strings imported by every screen for navigation. Never hard-code a
// route name inside a screen file; import ROUTES from here.
// Lives outside App.js so screens can import it without a circular import.

export const ROUTES = {
  // ── Root stack ────────────────────────────────────────────────────────────
  SPLASH:          'Splash',
  ONBOARDING:      'Onboarding',
  MAIN_TABS:       'MainTabs',
  RESULTS:         'Results',
  PLACE_DETAILS:   'PlaceDetails',
  NAVIGATION:      'Navigation',
  RATE_REVIEW:     'RateReview',
  ADD_PLACE:       'AddPlace',
  FOR_BUSINESS:    'ForBusiness',
  BIGGER_PICTURE:  'BiggerPicture',

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
};

export default ROUTES;

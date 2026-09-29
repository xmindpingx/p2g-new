// places2go — Moderation & Content Safety constants
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Covers: AI moderation pipeline (self-hosted Ollama), manual review workflow,
// photo upload configuration, and all admin-configurable app settings.
//
// Architecture:
//   • Ordinary users' devices never call Ollama. Submissions are only enqueued
//     (aiStatus PENDING → hidden until screened).
//   • Screening runs from a moderator's or administrator's device: the Admin
//     panel calls services/aiModeration.js, which sends each pending item to
//     the Ollama server at ollamaBaseUrl and records the verdict through
//     processModerationDecision() in the store. A backend can take over that
//     job later by calling the same store action.
//   • All Ollama connection settings live here as defaults; admin edits them
//     at runtime through the Admin Settings panel (updateAppSetting action).

// ---------------------------------------------------------------------------
// AI moderation statuses  (set by services/aiModeration.js or your backend)
// ---------------------------------------------------------------------------
export const AI_STATUS = {
  PENDING: 'pending', // submitted, not yet processed
  CLEAN:   'clean',   // model found no issue; content publicly visible
  FLAGGED: 'flagged', // model confidence ≥ nsfwFlagThreshold; needs review
  ERROR:   'error',   // Ollama unreachable / bad response; escalates to manual
};

// ---------------------------------------------------------------------------
// Manual review statuses  (set by mod or admin from the review queue panel)
// ---------------------------------------------------------------------------
export const MANUAL_STATUS = {
  AWAITING:  'awaiting',  // not yet reviewed by a human
  APPROVED:  'approved',  // human confirmed acceptable; content visible
  REJECTED:  'rejected',  // human confirmed violation; content stays hidden
};

// ---------------------------------------------------------------------------
// Derived content visibility  (computed, never stored)
// ---------------------------------------------------------------------------
export const CONTENT_VISIBILITY = {
  VISIBLE:      'visible',
  HIDDEN:       'hidden',
  UNDER_REVIEW: 'under_review',
};

// ---------------------------------------------------------------------------
// Content types tracked in the moderation queue
// ---------------------------------------------------------------------------
export const CONTENT_TYPE = {
  PHOTO:       'photo',        // image attached to a place or review
  REVIEW_TEXT: 'review_text',  // written body of a user review
  PLACE_NOTE:  'place_note',   // free-text "notes" field on a place submission
};

// ---------------------------------------------------------------------------
// Flag reason codes
// ---------------------------------------------------------------------------
export const FLAG_REASON = {
  NSFW_EXPLICIT:   'nsfw_explicit',
  NSFW_SUGGESTIVE: 'nsfw_suggestive',
  VIOLENCE:        'violence',
  HATE_SPEECH:     'hate_speech',
  SPAM:            'spam',
  PERSONAL_INFO:   'personal_info',
  MISINFORMATION:  'misinformation',
  INAPPROPRIATE:   'inappropriate',
  OTHER:           'other',
};

export const FLAG_REASON_LABELS = {
  [FLAG_REASON.NSFW_EXPLICIT]:   'Sexually Explicit',
  [FLAG_REASON.NSFW_SUGGESTIVE]: 'Suggestive Content',
  [FLAG_REASON.VIOLENCE]:        'Violence',
  [FLAG_REASON.HATE_SPEECH]:     'Hate Speech',
  [FLAG_REASON.SPAM]:            'Spam',
  [FLAG_REASON.PERSONAL_INFO]:   'Personal Information',
  [FLAG_REASON.MISINFORMATION]:  'Misinformation',
  [FLAG_REASON.INAPPROPRIATE]:   'Inappropriate',
  [FLAG_REASON.OTHER]:           'Other',
};

// ---------------------------------------------------------------------------
// Photo upload
// ---------------------------------------------------------------------------
export const UPLOAD_STATUS = {
  LOCAL:     'local',     // on device only, not yet uploaded
  UPLOADING: 'uploading', // transfer in progress
  UPLOADED:  'uploaded',  // on server; uploadedUrl is populated
  FAILED:    'failed',    // transfer failed; localUri still available for retry
};

export const buildPhotoEntry = ({
  localUri,
  uploadedUrl  = null,
  uploadStatus = UPLOAD_STATUS.LOCAL,
  submittedBy,
  placeId,
}) => ({
  id:                `photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  localUri,
  uploadedUrl,
  uploadStatus,
  submittedBy,
  placeId,
  moderationQueueId: null,                    // filled by submitToModerationQueue
  moderationStatus:  CONTENT_VISIBILITY.HIDDEN, // hidden until AI clears it
  createdAt:         new Date().toISOString(),
});

// ---------------------------------------------------------------------------
// Default app settings — every value is editable by mod/admin at runtime.
// The store is initialised with these values and persists any changes.
// ---------------------------------------------------------------------------
export const DEFAULT_APP_SETTINGS = {
  // ── Photo limits ──────────────────────────────────────────────────────────
  maxPhotosPerPlace:          10,    // contributor may attach up to this many images
  maxPhotosPerReview:          3,    // reviewer may attach up to this many images

  // ── $2 payout qualification ───────────────────────────────────────────────
  payoutAmountUSD:             2.00,
  reviewMinTextLength:         20,   // characters after trim
  reviewMinAmenityChecks:       2,   // amenity keys that must be checked true
  payoutForNoRestroomReports:  true, // "No public restroom here" reports earn the
                                     // same amount once an admin verifies them

  // ── Co-branding / partner banners (admin only) ────────────────────────────
  cobrandingEnabled:           true, // master switch for showing partner banners to users
  cobrandingMaxSuggestedItems:    5, // items a partner may list on its banner
  cobrandingHeadlineMaxLength:   60, // characters
  cobrandingCourtesyMessage:
    'Be kind to the business hosting this restroom — consider supporting them with a purchase.',
  // Partner finder (admin): incentive offered to a business that enrolls its own restroom.
  // The amount is a setting; what it is "off" is described by partnerIncentiveAppliesTo.
  partnerIncentiveEnabled:     true,
  partnerIncentiveAmountUSD:   2,
  partnerIncentiveAppliesTo:   '',   // e.g. "your first partner banner" — blank = just "$2 off"
  overpassBaseUrl:             'http://localhost:8097/api/interpreter', // your own Overpass (server/overpass); from a phone use http://<server-ip>:8097/api/interpreter
  ollamaOutreachModel:         '',   // model for partner ranking + first-contact drafts (blank = text moderation model)
  cobrandingSenderName:        '',   // signature on outreach templates
  cobrandingSenderAddress:     '',   // postal address in the footer of first-contact emails (US commercial email must include one)
  cobrandingSenderEmail:       '',   // reply-to shown in outreach templates

  // ── Stripe (admin only) ───────────────────────────────────────────────────
  // Only the PUBLISHABLE key belongs in the app. The secret key stays on your
  // payments server (see server/stripe-server.example.js).
  stripePublishableKey:        '',                             // pk_test_… / pk_live_…
  stripeMerchantIdentifier:    'merchant.com.places2go.app',   // Apple Pay merchant id — must match app.json
  stripeMerchantCountryCode:   'US',
  stripeApplePayEnabled:       true,
  stripeGooglePayEnabled:      true,
  stripeGooglePayTestEnv:      true,                           // false for production Google Pay
  paymentsApiBaseUrl:          'http://localhost:3000',        // your server that talks to Stripe
  payoutsViaStripeConnect:     true,                           // contributors can link a Stripe Connect account

  // ── Payout & donation methods (admin only) ────────────────────────────────
  // Cash App, Zelle, Apple Cash and Google Pay have no public payout API, so
  // credits paid these ways are sent by the admin from their own phone / bank
  // app and then marked paid in Admin → Verification & Payouts.
  cashAppEnabled:              true,
  zelleEnabled:                true,
  applePayPayoutsEnabled:      true,  // contributor receives in Apple Cash; admin sends from iPhone
  googlePayPayoutsEnabled:     true,  // admin sends from the Google Pay / Google Wallet app
  donationCashAppCashtag:      '',   // your $Cashtag for receiving donations
  donationZelleContact:        '',   // your Zelle email or US mobile number for donations

  // ── Donations (admin only) ────────────────────────────────────────────────
  donationsEnabled:            true,
  donationPresetAmountsUSD:    '3,5,10,25', // comma-separated whole-dollar presets
  donationMinimumUSD:          1,
  donationCurrency:            'usd',
  donationThankYouMessage:     'Thank you for supporting places2go.',

  // ── Payout abuse prevention — presence check (admin only) ─────────────────
  // While Add Place is open the app samples the device location. At submit it
  // records distance to the pin, time spent within the radius, whether the
  // device approached and later left the spot, GPS accuracy, and whether the
  // OS reported a mock location. The admin sees these facts on every credit.
  presenceCheckEnabled:            true,
  // Submissions (Add Place, Rate & Review) are only accepted while the device
  // is within this distance of the address; otherwise the user is told why.
  requirePresenceToSubmit:         true,
  submissionPresenceRadiusMeters:  150,
  presenceRadiusMeters:            75,    // "on the premises" when within this distance of the pin
  presenceInnerRadiusMeters:       15,    // "at the restroom" when within this distance of the marked restroom spot
  presenceMinDwellSeconds:         60,    // time within radius for a strong result
  presenceMaxAccuracyMeters:       50,    // samples less accurate than this are ignored
  presenceSampleIntervalSeconds:   10,
  presencePostSubmitWindowSeconds: 120,   // keep sampling after submit to see departure
  presenceBlockCreditOnFailed:     true,  // no credit when the check fails (admin can still approve manually)
  presenceBlockCreditOnMocked:     true,  // no credit when the OS flags a mock location
  payoutDailyCapPerUser:           5,     // credited submissions per user per day
  adminFakeLocationEnabled:        true,  // administrators may pin their location for testing (right-click the web map); samples are marked as mock
  payoutCooldownMinutes:           10,    // minimum gap between two credited submissions
  duplicateRadiusMeters:           30,    // an existing place this close with the same name is a duplicate

  // ── Automation: approve credits / pay without a human when the evidence is strong ──
  // Every rule below must pass for a credit to be approved automatically.
  // Anything that fails stays PENDING for a human. See services/autoApproval.js.
  autoApproveEnabled:              false, // master switch (off until the admin turns it on)
  autoApproveAcceptModeratePresence: false, // false = only STRONG presence evidence (GPS lock + dwell/movement)
  autoApproveMaxGpsAccuracyMeters: 30,    // median reported GPS accuracy of the visit must be at or under this
  autoApproveMinDwellSeconds:      60,    // time recorded within the place radius
  autoApproveRequireRestroomFix:   false, // require the contributor to have marked the restroom spot
  autoApproveRequireAiClean:       true,  // every review text / note / photo must be screened CLEAN by Ollama
  autoApproveMinReviewChars:       60,    // review text length
  autoApproveMinPhotos:            1,     // photos attached to the place or review
  autoApproveRequireSignedIn:      true,  // guests are never auto-approved
  autoApproveMinPriorApproved:     0,     // credits this contributor already had approved by a human or auto
  autoApproveMaxPerUserPerDay:     2,     // auto approvals per contributor per day (others wait for a human)
  autoPayEnabled:                  false, // pay auto-approved credits through Stripe Connect without a human
  autoPayMaxAmountUSD:             5,     // never auto-pay a single credit above this
  autoPayDailyLimitUSD:            25,    // total auto-paid per day across all contributors

  // ── Live map — opt-in location sharing (admin only) ───────────────────────
  // Users who turn on "Share my location" in Profile appear to other users as
  // anonymous dots. Positions are coarsened before leaving the device.
  liveMapEnabled:                  true,
  liveMapApiBaseUrl:               'http://localhost:3000',
  liveMapUpdateIntervalSeconds:    30,
  liveMapCoarsenDecimals:          3,     // 3 decimals ≈ 110 m; 2 ≈ 1.1 km
  liveMapStaleAfterSeconds:        180,   // hide a shared position older than this
  liveMapRadiusKm:                 10,

  // ── Pin colours (admin only) ──────────────────────────────────────────────
  // black  no restroom on site · red  restroom not open to the public
  // green  purchase required   · blue normal free restroom
  // yellow low rated           · orange flagged unsafe by visitors
  // silver highly rated        · gold best-rated within pinBestRadiusMiles of you
  pinBestRadiusMiles:              5,
  pinBestMinReviews:               1,
  pinLowRatingMax:                 3.0,  // average below this → yellow
  pinNiceRatingMin:                4.5,  // average at or above this → silver
  pinUnsafeMinReports:             1,    // "felt unsafe" reviews needed → orange

  // ── Review lock (admin only) ──────────────────────────────────────────────
  // A newly added place accepts reviews only from its contributor until the
  // contributor opens it up, or an admin releases the lock or removes it.
  reviewLockEnabled:               true,

  // ── Directions & approach (admin only) ────────────────────────────────────
  // Routes come from a self-hosted OSRM server (server/osrm/docker-compose.yml).
  // First-time setup: cd server/osrm && docker compose --profile preprocess up
  // Then start the live server: docker compose up -d
  // From a phone on the same LAN replace localhost with this machine's IP.
  // Walking routes use the foot profile; driving uses car — both are prebuilt.
  routingEnabled:                  true,
  routingBaseUrl:                  'http://localhost:8098',
  approachAlertMeters:             300,   // show the heading arrow + distance within this range

  // ── Hands-free voice search (admin only) ──────────────────────────────────
  handsFreeEnabled:                true,
  handsFreeLanguage:               'en-US',
  handsFreeSpeakResults:           true,
  handsFreeListenSeconds:          8,     // stop listening after this long without a final result

  // ── Legal (admin only) — interpolated into the Terms & Privacy text ───────
  legalEntityName:             'Chris Gavan',
  legalJurisdiction:           'Arizona, United States',
  legalContactEmail:           '',
  legalCopyrightOwner:         'Chris Gavan',
  legalCopyrightLocation:      'Arizona',
  legalCopyrightYears:         '2026–2027',
  legalTrademarkName:          'places2go',
  legalTrademarkRegistered:    false, // false → ™ (claimed mark); true → ® (only once registered)
  legalPatentNotice:           'Patent pending',
  legalPatentNumbers:          '',    // application / patent numbers to display, comma-separated
  legalMinimumAge:             13,   // minimum age to use the app at all
  legalContributorMinimumAge:  18,   // minimum age to add places, review, or receive payouts
  showPayoutLeaderboard:       true, // plain ranked contributor list on the Profile screen

  // ── Moderation behaviour ─────────────────────────────────────────────────
  autoFlagNsfwContent:         true, // enable AI screening on every submission
  requireManualReviewOnFlag:   true, // flagged content stays hidden until human approves
  nsfwFlagThreshold:           0.75, // classifier confidence score that triggers a flag (0.0–1.0)

  // ── Ollama connection ─────────────────────────────────────────────────────
  // Used from moderator/admin devices only (connection test and AI screening
  // in the Admin panel). Ordinary users' devices never contact this server.
  // Ollama must allow requests from the app's origin: for the web build set
  // OLLAMA_ORIGINS on the Ollama host (e.g. OLLAMA_ORIGINS="*" for testing).
  ollamaBaseUrl:               '',     // e.g. 'http://your-server:11434'
  ollamaApiKey:                '',     // bearer token if you proxy Ollama behind auth
  ollamaConnectionVerified:    false,  // true after a successful /api/tags ping

  // ── Ollama model selection ────────────────────────────────────────────────
  ollamaTextModerationModel:   '',   // model name for review text / place notes
  ollamaVisionModerationModel: '',   // model name for photo screening (must support vision)

  // ── Ollama inference parameters ───────────────────────────────────────────
  ollamaTemperature:           0.1,  // low = deterministic; best for classification
  ollamaTopP:                  0.9,
  ollamaTopK:                  40,
  ollamaNumCtx:                2048, // context window in tokens
  ollamaMaxTokens:              256, // max tokens in the model response
  ollamaTimeoutMs:           10000,  // ms before the request is abandoned

  // ── Bug reporting (admin only) ────────────────────────────────────────────
  // Users tap the bug-report icon (floating, accessible from all screens) to
  // capture a screenshot, timestamp, and any queued JS errors and POST them to
  // this endpoint. The admin reviews them in Admin → Bug Reports. Ollama can
  // optionally analyse the log text to surface a likely cause.
  bugReportUrl:              'http://localhost:3001/bug-reports', // your bug-report server
  bugReportOllamaEnabled:    true,   // run Ollama analysis on submitted error logs
};

// Keys that only an ADMIN (not a mod) may change
export const ADMIN_ONLY_SETTINGS = new Set([
  'payoutAmountUSD',
  'nsfwFlagThreshold',
  'ollamaBaseUrl',
  'ollamaApiKey',
  'ollamaConnectionVerified',
  'ollamaTextModerationModel',
  'ollamaVisionModerationModel',
  'ollamaTemperature',
  'ollamaTopP',
  'ollamaTopK',
  'ollamaNumCtx',
  'ollamaMaxTokens',
  'ollamaTimeoutMs',
  'requireManualReviewOnFlag',
  'autoFlagNsfwContent',
  'payoutForNoRestroomReports',
  'cobrandingEnabled',
  'cobrandingMaxSuggestedItems',
  'cobrandingHeadlineMaxLength',
  'cobrandingCourtesyMessage',
  'partnerIncentiveEnabled',
  'partnerIncentiveAmountUSD',
  'partnerIncentiveAppliesTo',
  'overpassBaseUrl',
  'ollamaOutreachModel',
  'cobrandingSenderName',
  'cobrandingSenderAddress',
  'cobrandingSenderEmail',
  'stripePublishableKey',
  'stripeMerchantIdentifier',
  'stripeMerchantCountryCode',
  'stripeApplePayEnabled',
  'stripeGooglePayEnabled',
  'stripeGooglePayTestEnv',
  'paymentsApiBaseUrl',
  'payoutsViaStripeConnect',
  'cashAppEnabled',
  'zelleEnabled',
  'applePayPayoutsEnabled',
  'googlePayPayoutsEnabled',
  'donationCashAppCashtag',
  'donationZelleContact',
  'donationsEnabled',
  'donationPresetAmountsUSD',
  'donationMinimumUSD',
  'donationCurrency',
  'donationThankYouMessage',
  'legalEntityName',
  'legalJurisdiction',
  'legalContactEmail',
  'legalCopyrightOwner',
  'legalCopyrightLocation',
  'legalCopyrightYears',
  'legalTrademarkName',
  'legalTrademarkRegistered',
  'legalPatentNotice',
  'legalPatentNumbers',
  'legalMinimumAge',
  'legalContributorMinimumAge',
  'showPayoutLeaderboard',
  'presenceCheckEnabled',
  'requirePresenceToSubmit',
  'submissionPresenceRadiusMeters',
  'presenceRadiusMeters',
  'presenceInnerRadiusMeters',
  'presenceMinDwellSeconds',
  'presenceMaxAccuracyMeters',
  'presenceSampleIntervalSeconds',
  'presencePostSubmitWindowSeconds',
  'presenceBlockCreditOnFailed',
  'presenceBlockCreditOnMocked',
  'payoutDailyCapPerUser',
  'payoutCooldownMinutes',
  'adminFakeLocationEnabled',
  'duplicateRadiusMeters',
  'autoApproveEnabled',
  'autoApproveAcceptModeratePresence',
  'autoApproveMaxGpsAccuracyMeters',
  'autoApproveMinDwellSeconds',
  'autoApproveRequireRestroomFix',
  'autoApproveRequireAiClean',
  'autoApproveMinReviewChars',
  'autoApproveMinPhotos',
  'autoApproveRequireSignedIn',
  'autoApproveMinPriorApproved',
  'autoApproveMaxPerUserPerDay',
  'autoPayEnabled',
  'autoPayMaxAmountUSD',
  'autoPayDailyLimitUSD',
  'liveMapEnabled',
  'liveMapApiBaseUrl',
  'liveMapUpdateIntervalSeconds',
  'liveMapCoarsenDecimals',
  'liveMapStaleAfterSeconds',
  'liveMapRadiusKm',
  'pinBestRadiusMiles',
  'pinBestMinReviews',
  'pinLowRatingMax',
  'pinNiceRatingMin',
  'pinUnsafeMinReports',
  'reviewLockEnabled',
  'routingEnabled',
  'routingBaseUrl',
  'approachAlertMeters',
  'handsFreeEnabled',
  'handsFreeLanguage',
  'handsFreeSpeakResults',
  'handsFreeListenSeconds',
]);

// Keys that both mod AND admin may change
export const MOD_ALLOWED_SETTINGS = new Set([
  'maxPhotosPerPlace',
  'maxPhotosPerReview',
  'reviewMinTextLength',
  'reviewMinAmenityChecks',
]);

// Human-readable labels for every setting key — used in the admin settings panel
export const APP_SETTING_LABELS = {
  maxPhotosPerPlace:           'Max Photos per Place Submission',
  maxPhotosPerReview:          'Max Photos per Review',
  payoutAmountUSD:             'Contributor Payout Amount (USD)',
  reviewMinTextLength:         'Review Min. Text Length (characters)',
  reviewMinAmenityChecks:      'Review Min. Amenity Checks',
  payoutForNoRestroomReports:  'Pay for Verified "No Restroom" Reports',
  cobrandingEnabled:           'Show Partner Banners to Users',
  cobrandingMaxSuggestedItems: 'Max Suggested Items per Banner',
  cobrandingHeadlineMaxLength: 'Banner Headline Max Length',
  cobrandingCourtesyMessage:   'Default Courtesy Message',
  partnerIncentiveEnabled:     'Offer enrollment incentive to partner businesses',
  partnerIncentiveAmountUSD:   'Enrollment incentive amount (USD)',
  partnerIncentiveAppliesTo:   'Incentive applies to (shown after "off")',
  overpassBaseUrl:             'OpenStreetMap Business Search URL (Overpass)',
  ollamaOutreachModel:         'Partner Outreach Model',
  cobrandingSenderName:        'Outreach Sender Name',
  cobrandingSenderAddress:     'Outreach Sender Postal Address (email footer)',
  cobrandingSenderEmail:       'Outreach Reply-To Email',
  stripePublishableKey:        'Stripe Publishable Key',
  stripeMerchantIdentifier:    'Apple Pay Merchant ID (must match app.json)',
  stripeMerchantCountryCode:   'Merchant Country Code',
  stripeApplePayEnabled:       'Offer Apple Pay',
  stripeGooglePayEnabled:      'Offer Google Pay',
  stripeGooglePayTestEnv:      'Google Pay Test Environment',
  paymentsApiBaseUrl:          'Payments Server URL',
  payoutsViaStripeConnect:     'Payouts via Stripe Connect',
  cashAppEnabled:              'Offer Cash App',
  zelleEnabled:                'Offer Zelle',
  applePayPayoutsEnabled:      'Offer Apple Pay (Apple Cash) for payouts',
  googlePayPayoutsEnabled:     'Offer Google Pay for payouts',
  donationCashAppCashtag:      'Your $Cashtag (receives donations)',
  donationZelleContact:        'Your Zelle Email or Phone (receives donations)',
  donationsEnabled:            'Accept Donations',
  donationPresetAmountsUSD:    'Donation Presets (USD, comma-separated)',
  donationMinimumUSD:          'Minimum Donation (USD)',
  donationCurrency:            'Donation Currency (ISO code)',
  donationThankYouMessage:     'Donation Thank-You Message',
  legalEntityName:             'Operating Entity / Owner Name',
  legalJurisdiction:           'Governing Law Jurisdiction',
  legalContactEmail:           'Legal Contact Email',
  legalCopyrightOwner:         'Copyright Owner',
  legalCopyrightLocation:      'Copyright Owner Location',
  legalCopyrightYears:         'Copyright Years',
  legalTrademarkName:          'Trademark Name',
  legalTrademarkRegistered:    'Trademark Is Registered (® instead of ™)',
  legalPatentNotice:           'Patent Notice',
  legalPatentNumbers:          'Patent / Application Numbers (comma-separated)',
  legalMinimumAge:             'Minimum Age to Use the App',
  legalContributorMinimumAge:  'Minimum Age to Contribute / Receive Payouts',
  showPayoutLeaderboard:       'Show Top Contributors List on Profile',
  presenceCheckEnabled:            'Record Presence Evidence on Submissions',
  requirePresenceToSubmit:         'Require GPS Confirmation to Submit / Review',
  submissionPresenceRadiusMeters:  'GPS Confirmation Radius (m)',
  presenceRadiusMeters:            '"On the Premises" Radius from Pin (m)',
  presenceInnerRadiusMeters:       '"At the Restroom" Radius from Marked Spot (m)',
  presenceMinDwellSeconds:         'Min. Time at Place for Strong Result (s)',
  presenceMaxAccuracyMeters:       'Ignore GPS Samples Less Accurate Than (m)',
  presenceSampleIntervalSeconds:   'GPS Sample Interval (s)',
  presencePostSubmitWindowSeconds: 'Keep Sampling After Submit (s)',
  presenceBlockCreditOnFailed:     'No Credit When Presence Check Fails',
  presenceBlockCreditOnMocked:     'No Credit When Mock Location Detected',
  payoutDailyCapPerUser:           'Max Credited Submissions per User per Day',
  autoApproveEnabled:              'Auto-approve credits that pass every check',
  autoApproveAcceptModeratePresence: 'Accept Moderate presence (otherwise Strong only)',
  autoApproveMaxGpsAccuracyMeters: 'Max median GPS accuracy (m)',
  autoApproveMinDwellSeconds:      'Min time within place radius (s)',
  autoApproveRequireRestroomFix:   'Require a marked restroom spot',
  autoApproveRequireAiClean:       'Require AI screening CLEAN on all content',
  autoApproveMinReviewChars:       'Min review length (characters)',
  autoApproveMinPhotos:            'Min photos attached',
  autoApproveRequireSignedIn:      'Signed-in contributors only',
  autoApproveMinPriorApproved:     'Min previously approved credits',
  autoApproveMaxPerUserPerDay:     'Max auto-approvals per contributor per day',
  autoPayEnabled:                  'Auto-pay auto-approved credits via Stripe',
  autoPayMaxAmountUSD:             'Max auto-paid amount per credit (USD)',
  autoPayDailyLimitUSD:            'Daily auto-pay limit, all contributors (USD)',
  payoutCooldownMinutes:           'Min. Minutes Between Credited Submissions',
  adminFakeLocationEnabled:        'Allow admins to fake GPS (testing)',
  duplicateRadiusMeters:           'Duplicate Place Radius (m)',
  liveMapEnabled:                  'Allow Live Location Sharing',
  liveMapApiBaseUrl:               'Live Map Server URL',
  liveMapUpdateIntervalSeconds:    'Position Update Interval (s)',
  liveMapCoarsenDecimals:          'Coordinate Decimals Shared (3 ≈ 110 m)',
  liveMapStaleAfterSeconds:        'Hide Positions Older Than (s)',
  liveMapRadiusKm:                 'Show Users Within (km)',
  pinBestRadiusMiles:              'Gold Pin: Best-Rated Within (miles)',
  pinBestMinReviews:               'Gold / Silver Pin: Min. Reviews',
  pinLowRatingMax:                 'Yellow Pin: Average Below',
  pinNiceRatingMin:                'Silver Pin: Average At or Above',
  pinUnsafeMinReports:             'Orange Pin: "Felt Unsafe" Reports Needed',
  reviewLockEnabled:               'Lock New Places to Their Contributor Until Released',
  routingEnabled:                  'Show Routes from OpenStreetMap (OSRM)',
  routingBaseUrl:                  'OSRM Routing Server URL',
  approachAlertMeters:             'Heading Arrow Range (m)',
  handsFreeEnabled:                'Hands-Free Voice Search',
  handsFreeLanguage:               'Voice Language (BCP-47, e.g. en-US)',
  handsFreeSpeakResults:           'Speak Results Aloud',
  handsFreeListenSeconds:          'Listening Timeout (s)',
  autoFlagNsfwContent:         'Enable AI Content Screening',
  requireManualReviewOnFlag:   'Require Manual Review on AI Flag',
  nsfwFlagThreshold:           'AI Flag Confidence Threshold (0–1)',
  ollamaBaseUrl:               'Ollama Server URL',
  ollamaApiKey:                'Ollama Auth Token (optional)',
  ollamaConnectionVerified:    'Connection Verified',
  ollamaTextModerationModel:   'Text Moderation Model',
  ollamaVisionModerationModel: 'Vision Moderation Model',
  ollamaTemperature:           'Temperature',
  ollamaTopP:                  'Top-P',
  ollamaTopK:                  'Top-K',
  ollamaNumCtx:                'Context Window (tokens)',
  ollamaMaxTokens:             'Max Output Tokens',
  ollamaTimeoutMs:             'Request Timeout (ms)',
};

// Groups for the settings panel UI
export const SETTINGS_GROUPS = {
  PHOTOS:       'photos',
  PAYOUTS:      'payouts',
  STRIPE:       'stripe',
  PAY_METHODS:  'pay_methods',
  DONATIONS:    'donations',
  COBRANDING:   'cobranding',
  ANTI_ABUSE:   'anti_abuse',
  AUTOMATION:   'automation',
  LIVE_MAP:     'live_map',
  PINS:         'pins',
  DIRECTIONS:   'directions',
  HANDS_FREE:   'hands_free',
  LEGAL:        'legal',
  MODERATION:   'moderation',
  OLLAMA_CONN:  'ollama_connection',
  OLLAMA_MODEL: 'ollama_model',
  OLLAMA_TUNE:  'ollama_tune',
};

export const SETTINGS_GROUP_LABELS = {
  [SETTINGS_GROUPS.PHOTOS]:       'Photo Limits',
  [SETTINGS_GROUPS.PAYOUTS]:      'Contributor Payouts',
  [SETTINGS_GROUPS.AUTOMATION]:   'Automatic Approval & Payment',
  [SETTINGS_GROUPS.STRIPE]:       'Stripe',
  [SETTINGS_GROUPS.PAY_METHODS]:  'Cash App, Zelle, Apple Pay & Google Pay',
  [SETTINGS_GROUPS.DONATIONS]:    'Donations',
  [SETTINGS_GROUPS.COBRANDING]:   'Co-branding & Partner Banners',
  [SETTINGS_GROUPS.ANTI_ABUSE]:   'Payout Abuse Prevention',
  [SETTINGS_GROUPS.LIVE_MAP]:     'Live Map — Location Sharing',
  [SETTINGS_GROUPS.PINS]:         'Map Pin Colours & Review Lock',
  [SETTINGS_GROUPS.DIRECTIONS]:   'Directions & Approach',
  [SETTINGS_GROUPS.HANDS_FREE]:   'Hands-Free Voice Search',
  [SETTINGS_GROUPS.LEGAL]:        'Legal — Ownership, Trademark & Patent',
  [SETTINGS_GROUPS.MODERATION]:   'Content Moderation',
  [SETTINGS_GROUPS.OLLAMA_CONN]:  'Ollama — Connection',
  [SETTINGS_GROUPS.OLLAMA_MODEL]: 'Ollama — Model Selection',
  [SETTINGS_GROUPS.OLLAMA_TUNE]:  'Ollama — Inference Parameters',
};

export const SETTINGS_GROUP_ORDER = [
  SETTINGS_GROUPS.PHOTOS,
  SETTINGS_GROUPS.PAYOUTS,
  SETTINGS_GROUPS.ANTI_ABUSE,
  SETTINGS_GROUPS.AUTOMATION,
  SETTINGS_GROUPS.STRIPE,
  SETTINGS_GROUPS.PAY_METHODS,
  SETTINGS_GROUPS.DONATIONS,
  SETTINGS_GROUPS.COBRANDING,
  SETTINGS_GROUPS.LIVE_MAP,
  SETTINGS_GROUPS.PINS,
  SETTINGS_GROUPS.DIRECTIONS,
  SETTINGS_GROUPS.HANDS_FREE,
  SETTINGS_GROUPS.LEGAL,
  SETTINGS_GROUPS.MODERATION,
  SETTINGS_GROUPS.OLLAMA_CONN,
  SETTINGS_GROUPS.OLLAMA_MODEL,
  SETTINGS_GROUPS.OLLAMA_TUNE,
];

export const SETTING_GROUP_MAP = {
  maxPhotosPerPlace:           SETTINGS_GROUPS.PHOTOS,
  maxPhotosPerReview:          SETTINGS_GROUPS.PHOTOS,
  payoutAmountUSD:             SETTINGS_GROUPS.PAYOUTS,
  reviewMinTextLength:         SETTINGS_GROUPS.PAYOUTS,
  reviewMinAmenityChecks:      SETTINGS_GROUPS.PAYOUTS,
  payoutForNoRestroomReports:  SETTINGS_GROUPS.PAYOUTS,
  showPayoutLeaderboard:       SETTINGS_GROUPS.PAYOUTS,
  stripePublishableKey:        SETTINGS_GROUPS.STRIPE,
  stripeMerchantIdentifier:    SETTINGS_GROUPS.STRIPE,
  stripeMerchantCountryCode:   SETTINGS_GROUPS.STRIPE,
  stripeApplePayEnabled:       SETTINGS_GROUPS.STRIPE,
  stripeGooglePayEnabled:      SETTINGS_GROUPS.STRIPE,
  stripeGooglePayTestEnv:      SETTINGS_GROUPS.STRIPE,
  paymentsApiBaseUrl:          SETTINGS_GROUPS.STRIPE,
  payoutsViaStripeConnect:     SETTINGS_GROUPS.STRIPE,
  cashAppEnabled:              SETTINGS_GROUPS.PAY_METHODS,
  zelleEnabled:                SETTINGS_GROUPS.PAY_METHODS,
  applePayPayoutsEnabled:      SETTINGS_GROUPS.PAY_METHODS,
  googlePayPayoutsEnabled:     SETTINGS_GROUPS.PAY_METHODS,
  donationCashAppCashtag:      SETTINGS_GROUPS.PAY_METHODS,
  donationZelleContact:        SETTINGS_GROUPS.PAY_METHODS,
  donationsEnabled:            SETTINGS_GROUPS.DONATIONS,
  donationPresetAmountsUSD:    SETTINGS_GROUPS.DONATIONS,
  donationMinimumUSD:          SETTINGS_GROUPS.DONATIONS,
  donationCurrency:            SETTINGS_GROUPS.DONATIONS,
  donationThankYouMessage:     SETTINGS_GROUPS.DONATIONS,
  cobrandingEnabled:           SETTINGS_GROUPS.COBRANDING,
  cobrandingMaxSuggestedItems: SETTINGS_GROUPS.COBRANDING,
  cobrandingHeadlineMaxLength: SETTINGS_GROUPS.COBRANDING,
  cobrandingCourtesyMessage:   SETTINGS_GROUPS.COBRANDING,
  partnerIncentiveEnabled:     SETTINGS_GROUPS.COBRANDING,
  partnerIncentiveAmountUSD:   SETTINGS_GROUPS.COBRANDING,
  partnerIncentiveAppliesTo:   SETTINGS_GROUPS.COBRANDING,
  overpassBaseUrl:             SETTINGS_GROUPS.COBRANDING,
  ollamaOutreachModel:         SETTINGS_GROUPS.OLLAMA_MODEL,
  cobrandingSenderName:        SETTINGS_GROUPS.COBRANDING,
  cobrandingSenderAddress:     SETTINGS_GROUPS.COBRANDING,
  cobrandingSenderEmail:       SETTINGS_GROUPS.COBRANDING,
  legalEntityName:             SETTINGS_GROUPS.LEGAL,
  legalJurisdiction:           SETTINGS_GROUPS.LEGAL,
  legalContactEmail:           SETTINGS_GROUPS.LEGAL,
  legalCopyrightOwner:         SETTINGS_GROUPS.LEGAL,
  legalCopyrightLocation:      SETTINGS_GROUPS.LEGAL,
  legalCopyrightYears:         SETTINGS_GROUPS.LEGAL,
  legalTrademarkName:          SETTINGS_GROUPS.LEGAL,
  legalTrademarkRegistered:    SETTINGS_GROUPS.LEGAL,
  legalPatentNotice:           SETTINGS_GROUPS.LEGAL,
  legalPatentNumbers:          SETTINGS_GROUPS.LEGAL,
  legalMinimumAge:             SETTINGS_GROUPS.LEGAL,
  legalContributorMinimumAge:  SETTINGS_GROUPS.LEGAL,
  presenceCheckEnabled:            SETTINGS_GROUPS.ANTI_ABUSE,
  requirePresenceToSubmit:         SETTINGS_GROUPS.ANTI_ABUSE,
  submissionPresenceRadiusMeters:  SETTINGS_GROUPS.ANTI_ABUSE,
  presenceRadiusMeters:            SETTINGS_GROUPS.ANTI_ABUSE,
  presenceInnerRadiusMeters:       SETTINGS_GROUPS.ANTI_ABUSE,
  presenceMinDwellSeconds:         SETTINGS_GROUPS.ANTI_ABUSE,
  presenceMaxAccuracyMeters:       SETTINGS_GROUPS.ANTI_ABUSE,
  presenceSampleIntervalSeconds:   SETTINGS_GROUPS.ANTI_ABUSE,
  presencePostSubmitWindowSeconds: SETTINGS_GROUPS.ANTI_ABUSE,
  presenceBlockCreditOnFailed:     SETTINGS_GROUPS.ANTI_ABUSE,
  presenceBlockCreditOnMocked:     SETTINGS_GROUPS.ANTI_ABUSE,
  payoutDailyCapPerUser:           SETTINGS_GROUPS.ANTI_ABUSE,
  autoApproveEnabled:              SETTINGS_GROUPS.AUTOMATION,
  autoApproveAcceptModeratePresence: SETTINGS_GROUPS.AUTOMATION,
  autoApproveMaxGpsAccuracyMeters: SETTINGS_GROUPS.AUTOMATION,
  autoApproveMinDwellSeconds:      SETTINGS_GROUPS.AUTOMATION,
  autoApproveRequireRestroomFix:   SETTINGS_GROUPS.AUTOMATION,
  autoApproveRequireAiClean:       SETTINGS_GROUPS.AUTOMATION,
  autoApproveMinReviewChars:       SETTINGS_GROUPS.AUTOMATION,
  autoApproveMinPhotos:            SETTINGS_GROUPS.AUTOMATION,
  autoApproveRequireSignedIn:      SETTINGS_GROUPS.AUTOMATION,
  autoApproveMinPriorApproved:     SETTINGS_GROUPS.AUTOMATION,
  autoApproveMaxPerUserPerDay:     SETTINGS_GROUPS.AUTOMATION,
  autoPayEnabled:                  SETTINGS_GROUPS.AUTOMATION,
  autoPayMaxAmountUSD:             SETTINGS_GROUPS.AUTOMATION,
  autoPayDailyLimitUSD:            SETTINGS_GROUPS.AUTOMATION,
  payoutCooldownMinutes:           SETTINGS_GROUPS.ANTI_ABUSE,
  adminFakeLocationEnabled:        SETTINGS_GROUPS.ANTI_ABUSE,
  duplicateRadiusMeters:           SETTINGS_GROUPS.ANTI_ABUSE,
  liveMapEnabled:                  SETTINGS_GROUPS.LIVE_MAP,
  liveMapApiBaseUrl:               SETTINGS_GROUPS.LIVE_MAP,
  liveMapUpdateIntervalSeconds:    SETTINGS_GROUPS.LIVE_MAP,
  liveMapCoarsenDecimals:          SETTINGS_GROUPS.LIVE_MAP,
  liveMapStaleAfterSeconds:        SETTINGS_GROUPS.LIVE_MAP,
  liveMapRadiusKm:                 SETTINGS_GROUPS.LIVE_MAP,
  pinBestRadiusMiles:              SETTINGS_GROUPS.PINS,
  pinBestMinReviews:               SETTINGS_GROUPS.PINS,
  pinLowRatingMax:                 SETTINGS_GROUPS.PINS,
  pinNiceRatingMin:                SETTINGS_GROUPS.PINS,
  pinUnsafeMinReports:             SETTINGS_GROUPS.PINS,
  reviewLockEnabled:               SETTINGS_GROUPS.PINS,
  routingEnabled:                  SETTINGS_GROUPS.DIRECTIONS,
  routingBaseUrl:                  SETTINGS_GROUPS.DIRECTIONS,
  approachAlertMeters:             SETTINGS_GROUPS.DIRECTIONS,
  handsFreeEnabled:                SETTINGS_GROUPS.HANDS_FREE,
  handsFreeLanguage:               SETTINGS_GROUPS.HANDS_FREE,
  handsFreeSpeakResults:           SETTINGS_GROUPS.HANDS_FREE,
  handsFreeListenSeconds:          SETTINGS_GROUPS.HANDS_FREE,
  autoFlagNsfwContent:         SETTINGS_GROUPS.MODERATION,
  requireManualReviewOnFlag:   SETTINGS_GROUPS.MODERATION,
  nsfwFlagThreshold:           SETTINGS_GROUPS.MODERATION,
  ollamaBaseUrl:               SETTINGS_GROUPS.OLLAMA_CONN,
  ollamaApiKey:                SETTINGS_GROUPS.OLLAMA_CONN,
  ollamaConnectionVerified:    SETTINGS_GROUPS.OLLAMA_CONN,
  ollamaTextModerationModel:   SETTINGS_GROUPS.OLLAMA_MODEL,
  ollamaVisionModerationModel: SETTINGS_GROUPS.OLLAMA_MODEL,
  ollamaTemperature:           SETTINGS_GROUPS.OLLAMA_TUNE,
  ollamaTopP:                  SETTINGS_GROUPS.OLLAMA_TUNE,
  ollamaTopK:                  SETTINGS_GROUPS.OLLAMA_TUNE,
  ollamaNumCtx:                SETTINGS_GROUPS.OLLAMA_TUNE,
  ollamaMaxTokens:             SETTINGS_GROUPS.OLLAMA_TUNE,
  ollamaTimeoutMs:             SETTINGS_GROUPS.OLLAMA_TUNE,
};

// ---------------------------------------------------------------------------
// Moderation queue entry factory
// ---------------------------------------------------------------------------
export const buildModerationEntry = ({
  contentType,  // CONTENT_TYPE value
  contentRef,   // id of the photo / review / place
  submittedBy,  // userId
  placeId = null,
}) => {
  const now = new Date().toISOString();
  return {
    id:           `mq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    contentType,
    contentRef,
    submittedBy,
    placeId,
    aiStatus:     AI_STATUS.PENDING,
    aiConfidence: null,  // 0.0–1.0; null until screened
    flagReason:   null,  // FLAG_REASON value; set when flagged
    manualStatus: MANUAL_STATUS.AWAITING,
    reviewedBy:   null,  // userId of mod/admin who made the decision
    reviewedAt:   null,
    notes:        null,  // optional internal mod note
    createdAt:    now,
    updatedAt:    now,
  };
};

// ---------------------------------------------------------------------------
// Derived visibility helper — import into screens to gate rendering
// ---------------------------------------------------------------------------
/**
 * getContentVisibility(queueEntry, appSettings)
 *
 * Priority order:
 *  1. No queue entry (pre-moderation path)  → VISIBLE
 *  2. aiStatus PENDING                      → HIDDEN
 *  3. aiStatus ERROR                        → UNDER_REVIEW
 *  4. aiStatus CLEAN                        → VISIBLE
 *  5. aiStatus FLAGGED + manual APPROVED    → VISIBLE
 *  6. aiStatus FLAGGED + manual REJECTED    → HIDDEN
 *  7. aiStatus FLAGGED + manual AWAITING
 *       requireManualReviewOnFlag true      → UNDER_REVIEW
 *       requireManualReviewOnFlag false     → VISIBLE
 */
export const getContentVisibility = (
  queueEntry,
  appSettings = DEFAULT_APP_SETTINGS,
) => {
  if (!queueEntry) return CONTENT_VISIBILITY.VISIBLE;

  const { aiStatus, manualStatus } = queueEntry;

  if (aiStatus === AI_STATUS.PENDING) return CONTENT_VISIBILITY.HIDDEN;
  if (aiStatus === AI_STATUS.ERROR)   return CONTENT_VISIBILITY.UNDER_REVIEW;
  if (aiStatus === AI_STATUS.CLEAN)   return CONTENT_VISIBILITY.VISIBLE;

  // FLAGGED
  if (manualStatus === MANUAL_STATUS.APPROVED) return CONTENT_VISIBILITY.VISIBLE;
  if (manualStatus === MANUAL_STATUS.REJECTED) return CONTENT_VISIBILITY.HIDDEN;

  return appSettings.requireManualReviewOnFlag
    ? CONTENT_VISIBILITY.UNDER_REVIEW
    : CONTENT_VISIBILITY.VISIBLE;
};

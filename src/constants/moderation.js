// places2go — Moderation & Content Safety constants
// Covers: AI moderation pipeline (self-hosted Ollama), manual review workflow,
// photo upload configuration, and all admin-configurable app settings.
//
// Architecture:
//   • The app client NEVER calls Ollama directly.
//   • Client enqueues content → your backend reads the queue → calls Ollama →
//     calls back via processModerationDecision() in the store.
//   • All Ollama connection settings live here as defaults; admin edits them
//     at runtime through the Admin Settings panel (updateAppSetting action).

// ---------------------------------------------------------------------------
// AI moderation statuses  (set by backend / Ollama webhook)
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
  cobrandingSenderName:        '',   // signature on outreach templates
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
  // Cash App and Zelle have no public payout API, so credits paid this way are
  // sent by the admin from their own Cash App / bank app and then marked paid.
  cashAppEnabled:              true,
  zelleEnabled:                true,
  donationCashAppCashtag:      '',   // your $Cashtag for receiving donations
  donationZelleContact:        '',   // your Zelle email or US mobile number for donations

  // ── Donations (admin only) ────────────────────────────────────────────────
  donationsEnabled:            true,
  donationPresetAmountsUSD:    '3,5,10,25', // comma-separated whole-dollar presets
  donationMinimumUSD:          1,
  donationCurrency:            'usd',
  donationThankYouMessage:     'Thank you for supporting places2go.',

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
  // The client never calls this URL directly — your backend uses it.
  // Stored here so the admin panel can display and edit it, and your backend
  // can read the current value from your server-side config sync.
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
  'cobrandingSenderName',
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
  cobrandingSenderName:        'Outreach Sender Name',
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
  LEGAL:        'legal',
  MODERATION:   'moderation',
  OLLAMA_CONN:  'ollama_connection',
  OLLAMA_MODEL: 'ollama_model',
  OLLAMA_TUNE:  'ollama_tune',
};

export const SETTINGS_GROUP_LABELS = {
  [SETTINGS_GROUPS.PHOTOS]:       'Photo Limits',
  [SETTINGS_GROUPS.PAYOUTS]:      'Contributor Payouts',
  [SETTINGS_GROUPS.STRIPE]:       'Stripe',
  [SETTINGS_GROUPS.PAY_METHODS]:  'Cash App & Zelle',
  [SETTINGS_GROUPS.DONATIONS]:    'Donations',
  [SETTINGS_GROUPS.COBRANDING]:   'Co-branding & Partner Banners',
  [SETTINGS_GROUPS.LEGAL]:        'Legal — Ownership, Trademark & Patent',
  [SETTINGS_GROUPS.MODERATION]:   'Content Moderation',
  [SETTINGS_GROUPS.OLLAMA_CONN]:  'Ollama — Connection',
  [SETTINGS_GROUPS.OLLAMA_MODEL]: 'Ollama — Model Selection',
  [SETTINGS_GROUPS.OLLAMA_TUNE]:  'Ollama — Inference Parameters',
};

export const SETTINGS_GROUP_ORDER = [
  SETTINGS_GROUPS.PHOTOS,
  SETTINGS_GROUPS.PAYOUTS,
  SETTINGS_GROUPS.STRIPE,
  SETTINGS_GROUPS.PAY_METHODS,
  SETTINGS_GROUPS.DONATIONS,
  SETTINGS_GROUPS.COBRANDING,
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
  cobrandingSenderName:        SETTINGS_GROUPS.COBRANDING,
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
    aiConfidence: null,  // 0.0–1.0; null until backend responds
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

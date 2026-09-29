// places2go — Default Mode store (v4)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Zustand + AsyncStorage persistence.
//
// Contains:
//   • currentUser (device identity + optional signed-in account)
//   • appSettings (all configurable values including Ollama params)
//   • places (with full 60-key amenity schema + photo array; a place may also
//     be a verified "no public restroom" report)
//   • savedPlaceIds
//   • reviews (with per-review photo array)
//   • payoutLedger ($2 per qualifying contribution or verified report)
//   • officialAmenities + customAmenitySubmissions
//   • moderationQueue (AI + manual review pipeline)
//   • activityFeed (notifications for the Activity tab)
//   • coBranding (admin: business lookup, outreach log, partner banner per place)
//
// No gamification state of any kind.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_AMENITIES,
  AMENITY_KEY_SET,
  OFFICIAL_AMENITIES_SEED,
  CUSTOM_AMENITY_STATUS,
  CUSTOM_AMENITY_MAX_LABEL_LENGTH,
  AMENITY_GROUPS,
  buildOfficialAmenity,
} from '../constants/amenities';

import {
  DEFAULT_APP_SETTINGS,
  ADMIN_ONLY_SETTINGS,
  MOD_ALLOWED_SETTINGS,
  UPLOAD_STATUS,
  buildPhotoEntry,
  buildModerationEntry,
  AI_STATUS,
  MANUAL_STATUS,
  CONTENT_TYPE,
  FLAG_REASON,
} from '../constants/moderation';

import {
  PARTNERSHIP_STATUS,
  OUTREACH_CHANNEL,
  COBRANDING_LIMITS,
  buildCoBrandingProfile,
  buildSuggestedItem,
  buildOutreachEntry,
} from '../constants/cobranding';

import {
  summarizeVisitEvidence,
  evaluatePayoutRisk,
  mergeEvidenceSamples,
  RISK_FLAG_LABELS,
} from '../services/presence';

// ---------------------------------------------------------------------------
// User roles
// ---------------------------------------------------------------------------
export const USER_ROLES = {
  USER:  'user',
  MOD:   'mod',
  ADMIN: 'admin',
};

// ---------------------------------------------------------------------------
// Sign-in providers  (currentUser.auth.provider)
// ---------------------------------------------------------------------------
export const AUTH_PROVIDERS = {
  APPLE:  'apple',
  GOOGLE: 'google',
  GUEST:  'guest',
};

export const AUTH_PROVIDER_LABELS = {
  [AUTH_PROVIDERS.APPLE]:  'Apple',
  [AUTH_PROVIDERS.GOOGLE]: 'Google',
  [AUTH_PROVIDERS.GUEST]:  'Guest',
};

// ---------------------------------------------------------------------------
// Payout methods  (currentUser.payoutMethod.type)
// ---------------------------------------------------------------------------
export const PAYOUT_METHODS = {
  STRIPE:   'stripe_connect',
  CASH_APP: 'cash_app',
  ZELLE:    'zelle',
};

export const PAYOUT_METHOD_LABELS = {
  [PAYOUT_METHODS.STRIPE]:   'Stripe',
  [PAYOUT_METHODS.CASH_APP]: 'Cash App',
  [PAYOUT_METHODS.ZELLE]:    'Zelle',
};

// $Cashtag: "$" optional on input, starts with a letter, then letters / digits / _ / -
export const CASHTAG_PATTERN = /^\$?[A-Za-z][A-Za-z0-9_-]{0,19}$/;
export const normalizeCashtag = (value = '') => {
  const v = value.trim();
  if (!v) return '';
  return v.startsWith('$') ? v : `$${v}`;
};
// Zelle enrols an email address or a US mobile number
export const isValidZelleContact = (value = '') => {
  const v = value.trim();
  if (!v) return false;
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const phone = /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(v);
  return email || phone;
};

// ---------------------------------------------------------------------------
// Payout status / kind
// ---------------------------------------------------------------------------
export const PAYOUT_STATUS = {
  PENDING:  'pending',
  APPROVED: 'approved',
  PAID:     'paid',
  REJECTED: 'rejected',
};

export const PAYOUT_KIND = {
  PLACE_REVIEW:       'place_review',       // added a place + wrote a qualifying review
  NO_RESTROOM_REPORT: 'no_restroom_report', // reported "no public restroom" at an address; admin verified
};

export const PAYOUT_KIND_LABELS = {
  [PAYOUT_KIND.PLACE_REVIEW]:       'Place + review',
  [PAYOUT_KIND.NO_RESTROOM_REPORT]: 'No-restroom report',
};

// ---------------------------------------------------------------------------
// "No public restroom" report verification  (place.reportVerification)
// Only set on places with hasPublicRestroom === false; null otherwise.
// ---------------------------------------------------------------------------
export const REPORT_VERIFICATION = {
  AWAITING: 'awaiting',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

export const PLACE_TYPES = ['Restaurant', 'Retail', 'Gas Station', 'Other'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const generateId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const nowISO = () => new Date().toISOString();

const initialsFor = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'YO';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
};

const averageRating = (reviews) => {
  if (!reviews.length) return 0;
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  return Math.round((total / reviews.length) * 10) / 10;
};

const countCheckedAmenities = (amenities = {}) =>
  Object.entries(amenities).filter(
    ([key, val]) => val === true && AMENITY_KEY_SET.has(key),
  ).length;

/**
 * isQualifyingReview — thresholds are read from the live appSettings in the
 * store so admin changes take effect immediately without a restart.
 */
const _isQualifyingReview = (review, settings) => {
  if (!review) return false;
  const ratingOk =
    Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5;
  const textOk =
    typeof review.text === 'string' &&
    review.text.trim().length >= settings.reviewMinTextLength;
  const amenitiesOk =
    countCheckedAmenities(review.amenities) >= settings.reviewMinAmenityChecks;
  return ratingOk && textOk && amenitiesOk;
};

// Export a static version using defaults for tests / external use
export const isQualifyingReview = (review) =>
  _isQualifyingReview(review, DEFAULT_APP_SETTINGS);

/**
 * buildPayoutEntry — every ledger entry starts PENDING with a one-step
 * history. Each later status change appends to `history`, which is the
 * "trail" shown on the Profile screen.
 */
const buildPayoutEntry = ({ kind, userId, placeId, reviewId = null, amount, createdAt = nowISO() }) => ({
  id:         generateId('payout'),
  kind,
  userId,
  placeId,
  reviewId,
  amount,
  currency:   'USD',
  status:     PAYOUT_STATUS.PENDING,
  transferId: null,
  paidVia:    null,
  history:    [{ status: PAYOUT_STATUS.PENDING, at: createdAt, by: null, note: null }],
  createdAt,
  updatedAt:  createdAt,
});

const withPayoutStatus = (entry, status, { by = null, note = null, transferId, paidVia } = {}) => {
  const at = nowISO();
  return {
    ...entry,
    status,
    transferId: transferId !== undefined ? transferId : entry.transferId,
    paidVia:    paidVia    !== undefined ? paidVia    : entry.paidVia,
    history:    [...(entry.history || []), { status, at, by, note }],
    updatedAt:  at,
  };
};

// ---------------------------------------------------------------------------
// Seed data — fictional placeholders; not real businesses
// ---------------------------------------------------------------------------
const SEED_USER_ID = 'user_local';

const makeSeedAmenities = (overrides = {}) => ({
  ...DEFAULT_AMENITIES,
  ...overrides,
});

export const SEED_PLACES = [
  {
    id: 'place_seed_1',
    name: 'Riverside Market',
    address: '100 Riverside Dr',
    placeType: 'Retail',
    latitude: 33.4484,
    longitude: -112.074,
    hasPublicRestroom: true,
    reportVerification: null,
    isOpen: true,
    hoursLabel: 'Open · Closes 10 PM',
    amenities: makeSeedAmenities({
      isIndoor: true, isWellLit: true, isSafe: true, isEasyToFind: true,
      isEasyToAccess: true, isOnGroundFloor: true, isMultiStall: true,
      hasMensRoom: true, hasWomensRoom: true, hasChangingStation: true,
      hasFamilyRoom: true, hasWheelchairStall: true, hasGrabBars: true,
      hasStepFreeEntry: true, hasSoap: true, hasHotWater: true,
      hasPaperTowels: true, hasToiletPaper: true, hasSeatCovers: true,
      hasFeminineDisposal: true, isFree: true, isClean: true,
      isWellMaintained: true,
    }),
    customAmenityIds: [],
    photos: [],
    notes: '',
    verified: true,
    contributorId: 'user_seed_a',
    payoutCredited: true,
    createdAt: '2026-09-01T12:00:00.000Z',
  },
  {
    id: 'place_seed_2',
    name: 'Main Street Cafe',
    address: '42 Main St',
    placeType: 'Restaurant',
    latitude: 33.4515,
    longitude: -112.0695,
    hasPublicRestroom: true,
    reportVerification: null,
    isOpen: true,
    hoursLabel: 'Open · Closes 9 PM',
    amenities: makeSeedAmenities({
      isIndoor: true, isWellLit: true, isSafe: true, isEasyToFind: true,
      isSingleOccupancy: true, isGenderNeutral: true, hasSoap: true,
      hasHotWater: true, hasHandDryer: true, hasToiletPaper: true,
      hasFemininePad: true, requiresKey: true, isFree: true, isClean: true,
    }),
    customAmenityIds: [],
    photos: [],
    notes: 'Ask staff for the key.',
    verified: true,
    contributorId: 'user_seed_b',
    payoutCredited: true,
    createdAt: '2026-09-03T12:00:00.000Z',
  },
  {
    id: 'place_seed_3',
    name: 'Northgate Fuel',
    address: '900 Northgate Blvd',
    placeType: 'Gas Station',
    latitude: 33.4562,
    longitude: -112.0782,
    hasPublicRestroom: true,
    reportVerification: null,
    isOpen: true,
    hoursLabel: 'Open 24 hours',
    amenities: makeSeedAmenities({
      isIndoor: true, isWellLit: true, isMultiStall: true,
      hasMensRoom: true, hasWomensRoom: true, hasSoap: true,
      hasPaperTowels: true, hasToiletPaper: true, vendingCondoms: true,
      vendingFeminineProducts: true, vendingSnacks: true,
      isFree: true, isOpen24Hours: true,
    }),
    customAmenityIds: [],
    photos: [],
    notes: '',
    verified: false,
    contributorId: 'user_seed_c',
    payoutCredited: false,
    createdAt: '2026-09-10T12:00:00.000Z',
  },
  {
    id: 'place_seed_4',
    name: 'Harbor Grocery',
    address: '7 Harbor Way',
    placeType: 'Retail',
    latitude: 33.4431,
    longitude: -112.0803,
    hasPublicRestroom: true,
    reportVerification: null,
    isOpen: false,
    hoursLabel: 'Closed · Opens 7 AM',
    amenities: makeSeedAmenities({
      isIndoor: true, isWellLit: true, isSafe: true, isEasyToFind: true,
      isEasyToAccess: true, isMultiStall: true, hasMensRoom: true,
      hasWomensRoom: true, hasFamilyRoom: true, hasChangingStation: true,
      hasKidSizedToilet: true, hasNursingArea: true, hasWheelchairStall: true,
      hasGrabBars: true, hasLowSink: true, hasAutoDoor: true,
      hasStepFreeEntry: true, hasSoap: true, hasHotWater: true,
      hasPaperTowels: true, hasHandDryer: true, hasToiletPaper: true,
      hasSeatCovers: true, hasFeminineDisposal: true, hasBabyWipes: true,
      isFree: true, isClean: true, isWellMaintained: true, hasAirFreshener: true,
    }),
    customAmenityIds: [],
    photos: [],
    notes: 'Family restroom near the pharmacy.',
    verified: true,
    contributorId: 'user_seed_a',
    payoutCredited: true,
    createdAt: '2026-09-12T12:00:00.000Z',
  },
  {
    // A "no public restroom" report — fictional, awaiting admin verification
    id: 'place_seed_5',
    name: 'Corner Pharmacy',
    address: '215 Elm St',
    placeType: 'Retail',
    latitude: 33.4502,
    longitude: -112.0768,
    hasPublicRestroom: false,
    noRestroomReason: 'not_public',
    reportVerification: REPORT_VERIFICATION.AWAITING,
    reviewLock: null,
    isOpen: false,
    hoursLabel: '',
    amenities: makeSeedAmenities(),
    customAmenityIds: [],
    photos: [],
    notes: 'Sign on the door says restrooms are for employees only.',
    verified: false,
    contributorId: 'user_seed_c',
    payoutCredited: true, // the pending ledger entry below is this place's credit
    createdAt: '2026-09-20T12:00:00.000Z',
  },
];

// Pending credit for the seed report above (fictional)
export const SEED_PAYOUTS = [
  {
    id:         'payout_seed_1',
    kind:       PAYOUT_KIND.NO_RESTROOM_REPORT,
    userId:     'user_seed_c',
    placeId:    'place_seed_5',
    reviewId:   null,
    amount:     DEFAULT_APP_SETTINGS.payoutAmountUSD,
    currency:   'USD',
    status:     PAYOUT_STATUS.PENDING,
    transferId: null,
    paidVia:    null,
    history:    [{ status: PAYOUT_STATUS.PENDING, at: '2026-09-20T12:00:00.000Z', by: null, note: null }],
    createdAt:  '2026-09-20T12:00:00.000Z',
    updatedAt:  '2026-09-20T12:00:00.000Z',
  },
];

export const SEED_REVIEWS = [
  {
    id: 'review_seed_1',
    placeId: 'place_seed_1',
    userId: 'user_seed_a',
    rating: 5,
    text: 'Always clean and well maintained. Great family room with a changing table.',
    amenities: { isClean: true, isWellMaintained: true, hasFamilyRoom: true, hasChangingStation: true },
    photos: [],
    createdAt: '2026-09-01T12:30:00.000Z',
  },
  {
    id: 'review_seed_2',
    placeId: 'place_seed_2',
    userId: 'user_seed_b',
    rating: 4,
    text: 'Clean and easy to find. You have to ask for the key at the counter but it is worth it.',
    amenities: { isClean: true, requiresKey: true, isEasyToFind: true },
    photos: [],
    createdAt: '2026-09-03T12:30:00.000Z',
  },
  {
    id: 'review_seed_3',
    placeId: 'place_seed_4',
    userId: 'user_seed_a',
    rating: 5,
    text: 'Spotless family restroom with a changing table, nursing area, and wide wheelchair stall.',
    amenities: { isClean: true, hasFamilyRoom: true, hasChangingStation: true, hasNursingArea: true, hasWheelchairStall: true },
    photos: [],
    createdAt: '2026-09-12T12:30:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
const useStore = create(
  persist(
    (set, get) => ({
      // ── Identity ──────────────────────────────────────────────────────────
      // `id` is the stable device identity every contribution is attributed to.
      // `auth` is the signed-in account (null = not signed in). Signing in never
      // changes `id`, so local contributions and credits are never orphaned.
      currentUser: {
        id:          SEED_USER_ID,
        displayName: 'You',
        initials:    'YO',
        // Set back to USER_ROLES.USER to test the normal (non-admin) experience
        role:        USER_ROLES.ADMIN,
        auth:        null, // { provider, providerUserId, email, displayName, signedInAt }
        // Stripe Connect payout account status, as last reported by your server
        stripeConnect: null, // { accountId, detailsSubmitted, payoutsEnabled, checkedAt }
        // How this contributor wants to be paid. Cash App / Zelle are paid by
        // the admin from their own app and marked paid; Stripe uses Connect.
        payoutMethod: null, // { type: PAYOUT_METHODS.*, cashtag, zelleContact, holderName, updatedAt }
        // Live map: share my (coarsened) position with other users
        shareLocation: false,
      },
      hasCompletedOnboarding: false,

      // ── Legal acceptance ─────────────────────────────────────────────────
      // Version-stamped so an updated terms version re-prompts on next launch.
      legalAcceptance:       null, // { version, acceptedAt }
      contributorAcceptance: null, // { version, acceptedAt } — safety acknowledgment before first Add Place

      // ── Configurable app settings ─────────────────────────────────────────
      appSettings: { ...DEFAULT_APP_SETTINGS },

      // ── Core data ─────────────────────────────────────────────────────────
      places:        SEED_PLACES,
      savedPlaceIds: [],
      reviews:       SEED_REVIEWS,

      // ── Payout ledger ─────────────────────────────────────────────────────
      payoutLedger: SEED_PAYOUTS,

      // ── Donations (local record of completed Stripe payments) ─────────────
      donations: [], // { id, amount, currency, paymentIntentId, createdAt }

      // ── Amenity registry ──────────────────────────────────────────────────
      officialAmenities:        OFFICIAL_AMENITIES_SEED,
      customAmenitySubmissions: [],

      // ── Moderation queue ──────────────────────────────────────────────────
      moderationQueue: [],

      // ── Activity feed (notifications) ─────────────────────────────────────
      activityFeed: [],

      // ── Co-branding (admin) — keyed by placeId ────────────────────────────
      coBranding: {},

      // =======================================================================
      // ONBOARDING / LEGAL / SESSION
      // =======================================================================
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),

      /**
       * skipIntro — the top-centre "Skip" on Splash / Onboarding / Sign-in.
       * Marks onboarding as seen so the next launch does not replay it. Never
       * touches the signed-in session: skipping keeps you signed in.
       */
      skipIntro: () => set({ hasCompletedOnboarding: true }),

      acceptLegal: (version) =>
        set({ legalAcceptance: { version, acceptedAt: nowISO() } }),

      acceptContributorTerms: (version) =>
        set({ contributorAcceptance: { version, acceptedAt: nowISO() } }),

      /**
       * signIn — record a verified account from a provider (Apple / Google).
       * The app never stores provider tokens here; only the identity profile.
       */
      signIn: ({ provider, providerUserId, email = null, displayName = null }) => {
        if (!Object.values(AUTH_PROVIDERS).includes(provider)) {
          throw new Error(`signIn: unknown provider "${provider}"`);
        }
        set((s) => {
          const name = (displayName || '').trim() || s.currentUser.displayName;
          return {
            currentUser: {
              ...s.currentUser,
              displayName: name,
              initials:    initialsFor(name),
              auth: {
                provider,
                providerUserId: providerUserId || null,
                email:          email || null,
                displayName:    (displayName || '').trim() || null,
                signedInAt:     nowISO(),
              },
            },
          };
        });
      },

      continueAsGuest: () =>
        set((s) => ({
          currentUser: {
            ...s.currentUser,
            auth: {
              provider:       AUTH_PROVIDERS.GUEST,
              providerUserId: null,
              email:          null,
              displayName:    null,
              signedInAt:     nowISO(),
            },
          },
        })),

      /** signOut — clears the account only; local data and credits stay. */
      signOut: () =>
        set((s) => ({
          currentUser: { ...s.currentUser, displayName: 'You', initials: 'YO', auth: null },
        })),

      setStripeConnectStatus: (status) =>
        set((s) => ({
          currentUser: {
            ...s.currentUser,
            stripeConnect: status
              ? {
                  accountId:        status.accountId || null,
                  detailsSubmitted: !!status.detailsSubmitted,
                  payoutsEnabled:   !!status.payoutsEnabled,
                  checkedAt:        nowISO(),
                }
              : null,
          },
        })),

      setShareLocation: (enabled) =>
        set((s) => ({ currentUser: { ...s.currentUser, shareLocation: !!enabled } })),

      /**
       * setPayoutMethod — the contributor's chosen way to receive credits.
       *   { type: PAYOUT_METHODS.CASH_APP, cashtag, holderName }
       *   { type: PAYOUT_METHODS.ZELLE, zelleContact, holderName }
       *   { type: PAYOUT_METHODS.STRIPE }   (details live in stripeConnect)
       * Pass null to clear.
       */
      setPayoutMethod: (method) => {
        if (method === null) {
          set((s) => ({ currentUser: { ...s.currentUser, payoutMethod: null } }));
          return;
        }
        const { appSettings } = get();
        if (!Object.values(PAYOUT_METHODS).includes(method.type)) {
          throw new Error(`setPayoutMethod: unknown method "${method.type}"`);
        }
        if (method.type === PAYOUT_METHODS.CASH_APP) {
          if (!appSettings.cashAppEnabled) throw new Error('Cash App payouts are not enabled');
          if (!CASHTAG_PATTERN.test((method.cashtag || '').trim())) {
            throw new Error('Enter a valid $Cashtag (letters and numbers, starting with a letter)');
          }
        }
        if (method.type === PAYOUT_METHODS.ZELLE) {
          if (!appSettings.zelleEnabled) throw new Error('Zelle payouts are not enabled');
          if (!isValidZelleContact(method.zelleContact || '')) {
            throw new Error('Enter the email address or US mobile number enrolled with Zelle');
          }
        }
        if (method.type === PAYOUT_METHODS.STRIPE && !appSettings.payoutsViaStripeConnect) {
          throw new Error('Stripe payouts are not enabled');
        }
        set((s) => ({
          currentUser: {
            ...s.currentUser,
            payoutMethod: {
              type:         method.type,
              cashtag:      method.type === PAYOUT_METHODS.CASH_APP ? normalizeCashtag(method.cashtag) : null,
              zelleContact: method.type === PAYOUT_METHODS.ZELLE ? method.zelleContact.trim() : null,
              holderName:   (method.holderName || '').trim() || null,
              updatedAt:    nowISO(),
            },
          },
        }));
      },

      // =======================================================================
      // APP SETTINGS  (mod / admin only)
      // =======================================================================
      /**
       * updateAppSetting — change a single setting value.
       * Mods may only change MOD_ALLOWED_SETTINGS.
       * Admins may change anything.
       * Resetting ollamaConnectionVerified to false is automatic when the URL changes.
       */
      updateAppSetting: (key, value) => {
        const { currentUser, appSettings } = get();
        const isAdmin = currentUser.role === USER_ROLES.ADMIN;
        const isMod   = currentUser.role === USER_ROLES.MOD;

        if (ADMIN_ONLY_SETTINGS.has(key) && !isAdmin) {
          throw new Error(`updateAppSetting: "${key}" requires admin role`);
        }
        if (!ADMIN_ONLY_SETTINGS.has(key) && !MOD_ALLOWED_SETTINGS.has(key) && !isAdmin) {
          throw new Error(`updateAppSetting: "${key}" is not a configurable setting`);
        }
        if (!isAdmin && !isMod) {
          throw new Error('updateAppSetting: insufficient role');
        }

        const updated = { ...appSettings, [key]: value };

        // If the Ollama URL changes, invalidate the verified flag
        if (key === 'ollamaBaseUrl' && value !== appSettings.ollamaBaseUrl) {
          updated.ollamaConnectionVerified = false;
        }

        set({ appSettings: updated });
      },

      /**
       * verifyOllamaConnection — pings your Ollama server's /api/tags endpoint
       * and returns { ok, models, error }.
       * On success: sets ollamaConnectionVerified = true and returns available models.
       * On failure: sets ollamaConnectionVerified = false.
       *
       * The client calls this; the request goes to the Ollama server at ollamaBaseUrl.
       * If you proxy Ollama behind auth, set ollamaApiKey and it is sent as a
       * Bearer token.  This is the ONLY place in the app that calls Ollama directly —
       * it is a connectivity check only, not a classification request.
       */
      verifyOllamaConnection: async () => {
        const { appSettings, currentUser } = get();
        if (
          currentUser.role !== USER_ROLES.ADMIN &&
          currentUser.role !== USER_ROLES.MOD
        ) {
          throw new Error('verifyOllamaConnection: insufficient role');
        }

        const { ollamaBaseUrl, ollamaApiKey, ollamaTimeoutMs } = appSettings;

        if (!ollamaBaseUrl || ollamaBaseUrl.trim() === '') {
          set((s) => ({
            appSettings: { ...s.appSettings, ollamaConnectionVerified: false },
          }));
          return { ok: false, models: [], error: 'Ollama server URL is not set.' };
        }

        const url = `${ollamaBaseUrl.replace(/\/$/, '')}/api/tags`;
        const headers = ollamaApiKey
          ? { Authorization: `Bearer ${ollamaApiKey}` }
          : {};

        try {
          const controller = new AbortController();
          const timeoutId  = setTimeout(
            () => controller.abort(),
            ollamaTimeoutMs || 10000,
          );

          const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
          }

          const data   = await response.json();
          const models = (data.models || []).map((m) => m.name);

          set((s) => ({
            appSettings: { ...s.appSettings, ollamaConnectionVerified: true },
          }));

          return { ok: true, models, error: null };
        } catch (err) {
          const errorMessage =
            err.name === 'AbortError'
              ? `Connection timed out after ${ollamaTimeoutMs}ms`
              : err.message;

          set((s) => ({
            appSettings: { ...s.appSettings, ollamaConnectionVerified: false },
          }));

          return { ok: false, models: [], error: errorMessage };
        }
      },

      // =======================================================================
      // SAVED PLACES
      // =======================================================================
      toggleSavedPlace: (placeId) =>
        set((state) => ({
          savedPlaceIds: state.savedPlaceIds.includes(placeId)
            ? state.savedPlaceIds.filter((id) => id !== placeId)
            : [...state.savedPlaceIds, placeId],
        })),

      isPlaceSaved: (placeId) => get().savedPlaceIds.includes(placeId),

      // =======================================================================
      // MODERATION QUEUE  (internal — called by dropPin and addReview)
      // =======================================================================
      /**
       * _enqueue — internal helper; creates a moderation entry for a single
       * piece of content and appends it to the queue.
       * Returns the new queue entry.
       */
      _enqueue: (contentType, contentRef, submittedBy, placeId) => {
        const { appSettings } = get();
        if (!appSettings.autoFlagNsfwContent) return null;

        const entry = buildModerationEntry({
          contentType,
          contentRef,
          submittedBy,
          placeId,
        });
        set((s) => ({ moderationQueue: [entry, ...s.moderationQueue] }));
        return entry;
      },

      /**
       * processModerationDecision — called by your backend webhook when the
       * Ollama classifier returns a result for a queue entry.
       *
       * aiStatus:    one of AI_STATUS values
       * confidence:  float 0.0–1.0 from the classifier (null on error)
       * flagReason:  one of FLAG_REASON values (optional; set when flagged)
       */
      processModerationDecision: (queueId, aiStatus, confidence = null, flagReason = null) => {
        if (!Object.values(AI_STATUS).includes(aiStatus)) {
          throw new Error(`processModerationDecision: invalid aiStatus "${aiStatus}"`);
        }

        const { appSettings } = get();
        const threshold = appSettings.nsfwFlagThreshold;

        // Override: if confidence provided and exceeds threshold, force FLAGGED
        const resolvedStatus =
          aiStatus === AI_STATUS.CLEAN &&
          confidence !== null &&
          confidence >= threshold
            ? AI_STATUS.FLAGGED
            : aiStatus;

        set((s) => ({
          moderationQueue: s.moderationQueue.map((entry) =>
            entry.id !== queueId
              ? entry
              : {
                  ...entry,
                  aiStatus:     resolvedStatus,
                  aiConfidence: confidence,
                  flagReason:   resolvedStatus === AI_STATUS.FLAGGED ? flagReason : null,
                  updatedAt:    nowISO(),
                },
          ),
        }));
      },

      /**
       * setManualModerationStatus — mod/admin decision on a flagged item.
       * manualStatus: MANUAL_STATUS.APPROVED or MANUAL_STATUS.REJECTED
       * notes: optional internal comment
       */
      setManualModerationStatus: (queueId, manualStatus, notes = '') => {
        const { currentUser } = get();
        if (
          currentUser.role !== USER_ROLES.MOD &&
          currentUser.role !== USER_ROLES.ADMIN
        ) {
          throw new Error('setManualModerationStatus: insufficient role');
        }
        if (!Object.values(MANUAL_STATUS).includes(manualStatus)) {
          throw new Error(`setManualModerationStatus: invalid status "${manualStatus}"`);
        }

        const now = nowISO();
        set((s) => ({
          moderationQueue: s.moderationQueue.map((entry) =>
            entry.id !== queueId
              ? entry
              : {
                  ...entry,
                  manualStatus,
                  reviewedBy: currentUser.id,
                  reviewedAt: now,
                  notes:      notes.trim() || null,
                  updatedAt:  now,
                },
          ),
        }));
      },

      getPendingModerationItems: () =>
        get().moderationQueue.filter(
          (e) =>
            e.aiStatus === AI_STATUS.FLAGGED &&
            e.manualStatus === MANUAL_STATUS.AWAITING,
        ),

      getModerationEntryByRef: (contentRef) =>
        get().moderationQueue.find((e) => e.contentRef === contentRef) || null,

      // =======================================================================
      // PLACES
      // =======================================================================
      /**
       * dropPin — add a new place from the "Add a Place" form.
       *
       * photos: array of objects from buildPhotoEntry() — each has a localUri
       *   and uploadStatus. The upload itself is handled by the screen; the
       *   store records the photo metadata and enqueues each photo for
       *   AI moderation once it is marked UPLOADED.
       *
       * hasPublicRestroom: false records a "No public restroom here" report.
       *   Such a place has no amenities, cannot be reviewed, and — when
       *   appSettings.payoutForNoRestroomReports is on — earns the contributor
       *   credit once an admin verifies it (verifyNoRestroomReport).
       *
       * Photos are validated against appSettings.maxPhotosPerPlace.
       *
       * Returns the created place.
       */
      dropPin: ({
        name,
        address,
        latitude,
        longitude,
        placeType    = 'Other',
        amenities    = {},
        customAmenityIds = [],
        notes        = '',
        photos       = [],
        isOpen       = true,
        hoursLabel   = '',
        hasPublicRestroom = true,
        noRestroomReason  = 'not_public', // 'not_public' (red pin) | 'none_on_site' (black pin)
        visitSamples = [],   // location samples recorded while Add Place was open
        restroomFix  = null, // { lat, lon, accuracy, at } captured at the restroom door
        presenceDistanceM = null, // device distance to the address at submit (null = unknown)
      }) => {
        const { currentUser, appSettings, places, payoutLedger } = get();
        const maxPhotos = appSettings.maxPhotosPerPlace;

        if (photos.length > maxPhotos) {
          throw new Error(
            `dropPin: maximum ${maxPhotos} photos allowed per place (got ${photos.length})`,
          );
        }

        if (appSettings.requirePresenceToSubmit) {
          if (!Number.isFinite(presenceDistanceM)) {
            throw new Error('We could not confirm your location, so this place cannot be submitted yet. Check that location access is on for places2go and try again.');
          }
          if (presenceDistanceM > appSettings.submissionPresenceRadiusMeters) {
            throw new Error(`You are about ${Math.round(presenceDistanceM)} m from this address. Places can only be added while you are there (within ${appSettings.submissionPresenceRadiusMeters} m).`);
          }
        }

        const placeId  = generateId('place');
        const isReport = hasPublicRestroom === false;

        // Presence evidence + payout risk (facts only; the admin decides)
        const draft = { id: placeId, name: name.trim(), latitude, longitude };
        const visitEvidence = appSettings.presenceCheckEnabled
          ? summarizeVisitEvidence({ samples: visitSamples, place: draft, restroomFix, settings: appSettings })
          : null;
        const risk = evaluatePayoutRisk({
          evidence: visitEvidence,
          place:    draft,
          places,
          ledger:   payoutLedger,
          userId:   currentUser.id,
          settings: appSettings,
        });

        // Build photo entries and enqueue each uploaded photo for moderation
        const builtPhotos = photos.map((p) => {
          const photo = buildPhotoEntry({
            localUri:    p.localUri,
            uploadedUrl: p.uploadedUrl || null,
            uploadStatus: p.uploadStatus || UPLOAD_STATUS.LOCAL,
            submittedBy: currentUser.id,
            placeId,
          });
          return photo;
        });

        // A report earns its credit on verification, not on a review, so the
        // ledger entry is created now (PENDING) and the place is marked credited
        // so nothing else can pay it twice. Risk rules can block the credit.
        const reportEarnsPayout = isReport && appSettings.payoutForNoRestroomReports === true && risk.allowCredit;
        const createdAt = nowISO();

        const place = {
          id: placeId,
          name:     name.trim(),
          address:  (address || '').trim(),
          placeType: PLACE_TYPES.includes(placeType) ? placeType : 'Other',
          latitude,
          longitude,
          hasPublicRestroom:  !isReport,
          noRestroomReason:   isReport ? (noRestroomReason === 'none_on_site' ? 'none_on_site' : 'not_public') : null,
          reportVerification: isReport ? REPORT_VERIFICATION.AWAITING : null,
          // Review lock: only the contributor may review until released
          reviewLock: !isReport && appSettings.reviewLockEnabled
            ? { lockedToUserId: currentUser.id, lockedAt: createdAt }
            : null,
          isOpen:     isReport ? false : isOpen,
          hoursLabel: isReport ? '' : hoursLabel,
          amenities:        isReport ? { ...DEFAULT_AMENITIES } : { ...DEFAULT_AMENITIES, ...amenities },
          customAmenityIds: isReport || !Array.isArray(customAmenityIds) ? [] : customAmenityIds,
          notes:  (notes || '').trim(),
          photos: builtPhotos,
          verified:         false,
          contributorId:    currentUser.id,
          // A report that could not be credited (risk rules) is still recorded,
          // but payoutCredited stays false so an admin can credit it manually.
          payoutCredited:   reportEarnsPayout,
          visitEvidence,
          riskFlags:        risk.flags,
          presenceDistanceAtSubmitM: Number.isFinite(presenceDistanceM) ? Math.round(presenceDistanceM) : null,
          createdAt,
        };

        const payout = reportEarnsPayout
          ? { ...buildPayoutEntry({
              kind:    PAYOUT_KIND.NO_RESTROOM_REPORT,
              userId:  currentUser.id,
              placeId,
              amount:  appSettings.payoutAmountUSD,
              createdAt,
            }), riskFlags: risk.flags }
          : null;

        let activityEntry = null;
        if (payout) {
          activityEntry = {
            id:        generateId('activity'),
            type:      'payout_pending',
            message:   `Your $${appSettings.payoutAmountUSD.toFixed(2)} credit for reporting no public restroom at "${place.name}" is pending admin verification.`,
            placeId,
            payoutId:  payout.id,
            createdAt,
            read:      false,
          };
        } else if (isReport && appSettings.payoutForNoRestroomReports === true && !risk.allowCredit) {
          activityEntry = {
            id:        generateId('activity'),
            type:      'payout_not_eligible',
            message:   `Your report for "${place.name}" was saved but did not qualify for a credit: ${risk.flags.map((f) => RISK_FLAG_LABELS[f] || f).join('; ')}.`,
            placeId,
            createdAt,
            read:      false,
          };
        }

        set((s) => ({
          places:       [place, ...s.places],
          payoutLedger: payout        ? [payout, ...s.payoutLedger]        : s.payoutLedger,
          activityFeed: activityEntry ? [activityEntry, ...s.activityFeed] : s.activityFeed,
        }));

        // Enqueue place note for text moderation
        if (place.notes.length > 0) {
          get()._enqueue(CONTENT_TYPE.PLACE_NOTE, placeId, currentUser.id, placeId);
        }

        // Enqueue already-uploaded photos for vision moderation
        builtPhotos
          .filter((p) => p.uploadStatus === UPLOAD_STATUS.UPLOADED)
          .forEach((p) => {
            const entry = get()._enqueue(
              CONTENT_TYPE.PHOTO,
              p.id,
              currentUser.id,
              placeId,
            );
            if (entry) {
              // Link queue entry back to the photo object
              set((s) => ({
                places: s.places.map((pl) =>
                  pl.id !== placeId
                    ? pl
                    : {
                        ...pl,
                        photos: pl.photos.map((ph) =>
                          ph.id !== p.id
                            ? ph
                            : { ...ph, moderationQueueId: entry.id },
                        ),
                      },
                ),
              }));
            }
          });

        return place;
      },

      /**
       * updatePhotoUploadStatus — called by the upload screen once a photo
       * has been sent to the server. Marks it UPLOADED, sets the URL, and
       * enqueues it for vision moderation.
       */
      updatePhotoUploadStatus: (placeId, photoId, uploadedUrl) => {
        const { currentUser } = get();
        const entry = get()._enqueue(
          CONTENT_TYPE.PHOTO,
          photoId,
          currentUser.id,
          placeId,
        );

        set((s) => ({
          places: s.places.map((pl) =>
            pl.id !== placeId
              ? pl
              : {
                  ...pl,
                  photos: pl.photos.map((ph) =>
                    ph.id !== photoId
                      ? ph
                      : {
                          ...ph,
                          uploadedUrl,
                          uploadStatus:      UPLOAD_STATUS.UPLOADED,
                          moderationQueueId: entry?.id ?? ph.moderationQueueId,
                          moderationStatus:  entry ? 'hidden' : ph.moderationStatus,
                        },
                  ),
                },
          ),
        }));
      },

      /**
       * updateReviewPhotoUploadStatus — same as above, for a photo on a review.
       */
      updateReviewPhotoUploadStatus: (reviewId, photoId, uploadedUrl) => {
        const { currentUser } = get();
        const review = get().reviews.find((r) => r.id === reviewId);
        if (!review) return;
        const entry = get()._enqueue(CONTENT_TYPE.PHOTO, photoId, currentUser.id, review.placeId);

        set((s) => ({
          reviews: s.reviews.map((r) =>
            r.id !== reviewId
              ? r
              : {
                  ...r,
                  photos: r.photos.map((ph) =>
                    ph.id !== photoId
                      ? ph
                      : {
                          ...ph,
                          uploadedUrl,
                          uploadStatus:      UPLOAD_STATUS.UPLOADED,
                          moderationQueueId: entry?.id ?? ph.moderationQueueId,
                          moderationStatus:  entry ? 'hidden' : ph.moderationStatus,
                        },
                  ),
                },
          ),
        }));
      },

      /**
       * markPhotoUploadFailed — records a failed transfer so the UI can offer retry.
       */
      markPhotoUploadFailed: ({ placeId = null, reviewId = null, photoId }) => {
        const patch = (ph) =>
          ph.id !== photoId ? ph : { ...ph, uploadStatus: UPLOAD_STATUS.FAILED };
        set((s) => ({
          places:  placeId  ? s.places.map((p) => (p.id !== placeId ? p : { ...p, photos: p.photos.map(patch) })) : s.places,
          reviews: reviewId ? s.reviews.map((r) => (r.id !== reviewId ? r : { ...r, photos: r.photos.map(patch) })) : s.reviews,
        }));
      },

      getPlaceById: (placeId) =>
        get().places.find((p) => p.id === placeId) || null,

      /**
       * finalizeVisitEvidence — called by the Add Place flow once the
       * post-submit sampling window ends. Recomputes the evidence with the
       * departure samples so "left the premises" and time-on-premises are
       * captured. Never changes a credit that was already blocked or created;
       * it only refreshes the facts the admin will review.
       */
      finalizeVisitEvidence: (placeId, { allSamples = [], restroomFix = null } = {}) => {
        const { appSettings } = get();
        const place = get().places.find((p) => p.id === placeId);
        if (!place || !appSettings.presenceCheckEnabled) return null;

        // The Add Place flow keeps every raw sample (before and after submit)
        // in memory and passes the complete list here; stored evidence only
        // holds downsampled distances, so it is not merged back in.
        const evidence = summarizeVisitEvidence({
          samples:     mergeEvidenceSamples([], allSamples),
          place,
          restroomFix: restroomFix || place.visitEvidence?.restroomFix || null,
          settings:    appSettings,
          submittedAt: new Date(place.createdAt).getTime(),
        });
        evidence.finalizedAt = nowISO();

        set((s) => ({
          places: s.places.map((p) => (p.id !== placeId ? p : { ...p, visitEvidence: evidence })),
        }));
        return evidence;
      },

      /**
       * releaseReviewLock — the contributor opens their place to reviews from
       * everyone; an admin may release any lock.
       */
      releaseReviewLock: (placeId) => {
        const { currentUser } = get();
        const place = get().places.find((p) => p.id === placeId);
        if (!place) throw new Error('releaseReviewLock: place not found');
        if (!place.reviewLock) return;
        const isAdmin = currentUser.role === USER_ROLES.ADMIN;
        if (!isAdmin && place.reviewLock.lockedToUserId !== currentUser.id) {
          throw new Error('Only the contributor or an administrator can open this place to reviews');
        }
        set((s) => ({
          places: s.places.map((p) => (p.id !== placeId ? p : { ...p, reviewLock: null, reviewLockReleasedAt: nowISO(), reviewLockReleasedBy: currentUser.id })),
        }));
      },

      /**
       * removePlace — the contributor removes their own submission, or an admin
       * removes any place. Reviews and saved references are cleared; ledger
       * entries are kept for the record but a pending credit is rejected.
       */
      removePlace: (placeId, reason = '') => {
        const { currentUser } = get();
        const place = get().places.find((p) => p.id === placeId);
        if (!place) throw new Error('removePlace: place not found');
        const isAdmin = currentUser.role === USER_ROLES.ADMIN;
        if (!isAdmin && place.contributorId !== currentUser.id) {
          throw new Error('Only the contributor or an administrator can remove this place');
        }
        const now = nowISO();
        set((s) => ({
          places:        s.places.filter((p) => p.id !== placeId),
          reviews:       s.reviews.filter((r) => r.placeId !== placeId),
          savedPlaceIds: s.savedPlaceIds.filter((id) => id !== placeId),
          payoutLedger:  s.payoutLedger.map((e) =>
            e.placeId === placeId && e.status === PAYOUT_STATUS.PENDING
              ? withPayoutStatus(e, PAYOUT_STATUS.REJECTED, { by: currentUser.id, note: reason.trim() || 'Place removed' })
              : e,
          ),
          activityFeed: place.contributorId !== currentUser.id
            ? [{
                id: generateId('activity'), type: 'place_removed',
                message: `"${place.name}" was removed by an administrator${reason.trim() ? `: ${reason.trim()}` : '.'}`,
                createdAt: now, read: false, targetUserId: place.contributorId,
              }, ...s.activityFeed]
            : s.activityFeed,
        }));
      },

      // =======================================================================
      // "NO PUBLIC RESTROOM" REPORT VERIFICATION  (admin only)
      // =======================================================================
      /**
       * verifyNoRestroomReport — admin confirms the report is accurate.
       * Marks the place verified and approves its pending credit (if any).
       */
      verifyNoRestroomReport: (placeId, notes = '') => {
        const { currentUser, appSettings } = get();
        if (currentUser.role !== USER_ROLES.ADMIN) {
          throw new Error('verifyNoRestroomReport: admin role required');
        }
        const place = get().places.find((p) => p.id === placeId);
        if (!place || place.hasPublicRestroom !== false) {
          throw new Error('verifyNoRestroomReport: not a "no public restroom" report');
        }
        if (place.reportVerification !== REPORT_VERIFICATION.AWAITING) {
          throw new Error(`verifyNoRestroomReport: report already ${place.reportVerification}`);
        }

        const now    = nowISO();
        const payout = get().payoutLedger.find(
          (e) => e.placeId === placeId && e.kind === PAYOUT_KIND.NO_RESTROOM_REPORT && e.status === PAYOUT_STATUS.PENDING,
        ) || null;

        const activityEntry = {
          id:           generateId('activity'),
          type:         'report_verified',
          message:      payout
            ? `Your report of no public restroom at "${place.name}" was verified. Your $${payout.amount.toFixed(2)} credit is approved.`
            : `Your report of no public restroom at "${place.name}" was verified.`,
          placeId,
          payoutId:     payout?.id ?? null,
          createdAt:    now,
          read:         false,
          targetUserId: place.contributorId,
        };

        set((s) => ({
          places: s.places.map((p) =>
            p.id !== placeId
              ? p
              : {
                  ...p,
                  reportVerification: REPORT_VERIFICATION.VERIFIED,
                  verified:           true,
                  verifiedBy:         currentUser.id,
                  verifiedAt:         now,
                  verificationNotes:  notes.trim() || null,
                },
          ),
          payoutLedger: payout
            ? s.payoutLedger.map((e) =>
                e.id === payout.id
                  ? withPayoutStatus(e, PAYOUT_STATUS.APPROVED, { by: currentUser.id, note: 'Report verified' })
                  : e,
              )
            : s.payoutLedger,
          activityFeed: [activityEntry, ...s.activityFeed],
        }));

        return { place: get().places.find((p) => p.id === placeId), payoutApproved: !!payout, amount: appSettings.payoutAmountUSD };
      },

      /**
       * rejectNoRestroomReport — admin could not verify the report.
       * The pending credit (if any) is rejected; the place stays visible only
       * to its contributor.
       */
      rejectNoRestroomReport: (placeId, reason = '') => {
        const { currentUser } = get();
        if (currentUser.role !== USER_ROLES.ADMIN) {
          throw new Error('rejectNoRestroomReport: admin role required');
        }
        const place = get().places.find((p) => p.id === placeId);
        if (!place || place.hasPublicRestroom !== false) {
          throw new Error('rejectNoRestroomReport: not a "no public restroom" report');
        }
        if (place.reportVerification !== REPORT_VERIFICATION.AWAITING) {
          throw new Error(`rejectNoRestroomReport: report already ${place.reportVerification}`);
        }

        const now    = nowISO();
        const payout = get().payoutLedger.find(
          (e) => e.placeId === placeId && e.kind === PAYOUT_KIND.NO_RESTROOM_REPORT && e.status === PAYOUT_STATUS.PENDING,
        ) || null;

        const activityEntry = {
          id:           generateId('activity'),
          type:         'report_rejected',
          message:      `Your report of no public restroom at "${place.name}" could not be verified${reason.trim() ? `: ${reason.trim()}` : '.'}${payout ? ' No credit was issued.' : ''}`,
          placeId,
          payoutId:     payout?.id ?? null,
          createdAt:    now,
          read:         false,
          targetUserId: place.contributorId,
        };

        set((s) => ({
          places: s.places.map((p) =>
            p.id !== placeId
              ? p
              : {
                  ...p,
                  reportVerification: REPORT_VERIFICATION.REJECTED,
                  verified:           false,
                  verifiedBy:         currentUser.id,
                  verifiedAt:         now,
                  verificationNotes:  reason.trim() || null,
                },
          ),
          payoutLedger: payout
            ? s.payoutLedger.map((e) =>
                e.id === payout.id
                  ? withPayoutStatus(e, PAYOUT_STATUS.REJECTED, { by: currentUser.id, note: reason.trim() || 'Report not verified' })
                  : e,
              )
            : s.payoutLedger,
          activityFeed: [activityEntry, ...s.activityFeed],
        }));
      },

      getPendingReports: () =>
        get().places.filter(
          (p) => p.hasPublicRestroom === false && p.reportVerification === REPORT_VERIFICATION.AWAITING,
        ),

      // =======================================================================
      // REVIEWS
      // =======================================================================
      /**
       * addReview — submit a rating + amenity snapshot for a place.
       *
       * photos: array from buildPhotoEntry(); capped at appSettings.maxPhotosPerReview.
       *
       * Payout eligibility:
       *   • Reviewer is the place's contributor
       *   • Place has not yet been credited
       *   • Review qualifies (uses live appSettings thresholds)
       *
       * All text and photos are auto-enqueued for moderation.
       *
       * Returns { review, payout }.
       */
      addReview: ({
        placeId,
        rating,
        text      = '',
        amenities = {},
        photos    = [],
        presenceDistanceM = null, // device distance to the place at submit (null = unknown)
        feltUnsafe = false,       // visitor felt unsafe here (counts toward the orange pin)
      }) => {
        const { currentUser, appSettings } = get();
        const place = get().places.find((p) => p.id === placeId);
        if (!place) throw new Error(`addReview: place ${placeId} not found`);
        if (place.hasPublicRestroom === false) {
          throw new Error('addReview: this address is listed as having no public restroom and cannot be reviewed');
        }
        if (place.reviewLock && place.reviewLock.lockedToUserId !== currentUser.id) {
          throw new Error('This place is still locked to the person who added it. Reviews open up once they release it or an administrator does.');
        }
        if (appSettings.requirePresenceToSubmit) {
          if (!Number.isFinite(presenceDistanceM)) {
            throw new Error('We could not confirm your location, so this review cannot be submitted yet. Check that location access is on for places2go and try again.');
          }
          if (presenceDistanceM > appSettings.submissionPresenceRadiusMeters) {
            throw new Error(`You are about ${Math.round(presenceDistanceM)} m from ${place.name}. Reviews can only be left while you are there (within ${appSettings.submissionPresenceRadiusMeters} m).`);
          }
        }

        const maxPhotos = appSettings.maxPhotosPerReview;
        if (photos.length > maxPhotos) {
          throw new Error(
            `addReview: maximum ${maxPhotos} photos allowed per review (got ${photos.length})`,
          );
        }

        const reviewId = generateId('review');

        const builtPhotos = photos.map((p) =>
          buildPhotoEntry({
            localUri:    p.localUri,
            uploadedUrl: p.uploadedUrl || null,
            uploadStatus: p.uploadStatus || UPLOAD_STATUS.LOCAL,
            submittedBy: currentUser.id,
            placeId,
          }),
        );

        const review = {
          id:        reviewId,
          placeId,
          userId:    currentUser.id,
          rating,
          text:      (text || '').trim(),
          amenities,
          photos:    builtPhotos,
          presenceDistanceM: Number.isFinite(presenceDistanceM) ? Math.round(presenceDistanceM) : null,
          feltUnsafe: feltUnsafe === true,
          createdAt: nowISO(),
        };

        const qualifies =
          place.contributorId === currentUser.id &&
          place.payoutCredited === false &&
          _isQualifyingReview(review, appSettings);

        // Risk rules (presence evidence recorded when the place was added,
        // duplicates, daily cap, cooldown) can block the credit.
        const risk = qualifies
          ? evaluatePayoutRisk({
              evidence: place.visitEvidence || null,
              place,
              places:   get().places,
              ledger:   get().payoutLedger,
              userId:   currentUser.id,
              settings: appSettings,
            })
          : null;
        const earnsPayout = qualifies && risk.allowCredit;

        const payout = earnsPayout
          ? { ...buildPayoutEntry({
              kind:    PAYOUT_KIND.PLACE_REVIEW,
              userId:  currentUser.id,
              placeId,
              reviewId,
              amount:  appSettings.payoutAmountUSD,
            }), riskFlags: risk.flags }
          : null;

        let activityEntry = null;
        if (earnsPayout) {
          activityEntry = {
            id:        generateId('activity'),
            type:      'payout_pending',
            message:   `Your $${appSettings.payoutAmountUSD.toFixed(2)} contribution credit for "${place.name}" is pending review.`,
            placeId,
            payoutId:  payout.id,
            createdAt: nowISO(),
            read:      false,
          };
        } else if (qualifies && !risk.allowCredit) {
          activityEntry = {
            id:        generateId('activity'),
            type:      'payout_not_eligible',
            message:   `Your review of "${place.name}" was saved but did not qualify for a credit: ${risk.flags.map((f) => RISK_FLAG_LABELS[f] || f).join('; ')}.`,
            placeId,
            createdAt: nowISO(),
            read:      false,
          };
        }

        set((s) => ({
          reviews: [review, ...s.reviews],
          places: earnsPayout
            ? s.places.map((p) =>
                p.id === placeId ? { ...p, payoutCredited: true } : p,
              )
            : s.places,
          payoutLedger: payout ? [payout, ...s.payoutLedger] : s.payoutLedger,
          activityFeed: activityEntry
            ? [activityEntry, ...s.activityFeed]
            : s.activityFeed,
        }));

        // Enqueue review text for moderation
        if (review.text.length > 0) {
          get()._enqueue(CONTENT_TYPE.REVIEW_TEXT, reviewId, currentUser.id, placeId);
        }

        // Enqueue uploaded review photos
        builtPhotos
          .filter((p) => p.uploadStatus === UPLOAD_STATUS.UPLOADED)
          .forEach((p) =>
            get()._enqueue(CONTENT_TYPE.PHOTO, p.id, currentUser.id, placeId),
          );

        return { review, payout };
      },

      getReviewsForPlace: (placeId) =>
        get().reviews.filter((r) => r.placeId === placeId),

      getRatingSummary: (placeId) => {
        const reviews = get().reviews.filter((r) => r.placeId === placeId);
        return { average: averageRating(reviews), count: reviews.length };
      },

      // =======================================================================
      // PAYOUT LEDGER  (admin only for status changes)
      // =======================================================================
      /**
       * updatePayoutStatus — admin approves / rejects / re-opens a credit.
       * Use markPayoutPaid() for PAID so the transfer reference is recorded.
       * Every change appends to the entry's history (the payout trail).
       */
      updatePayoutStatus: (payoutId, status, note = '') => {
        const { currentUser } = get();
        if (currentUser.role !== USER_ROLES.ADMIN) {
          throw new Error('updatePayoutStatus: admin role required');
        }
        if (!Object.values(PAYOUT_STATUS).includes(status)) {
          throw new Error(`updatePayoutStatus: invalid status "${status}"`);
        }
        const payout = get().payoutLedger.find((e) => e.id === payoutId);
        if (!payout) throw new Error(`updatePayoutStatus: payout ${payoutId} not found`);
        if (payout.status === PAYOUT_STATUS.PAID) {
          throw new Error('updatePayoutStatus: a paid credit cannot be changed');
        }
        const place = get().places.find((p) => p.id === payout.placeId) || null;

        const activityEntry =
          status === PAYOUT_STATUS.APPROVED || status === PAYOUT_STATUS.REJECTED
            ? {
                id:   generateId('activity'),
                type: `payout_${status}`,
                message:
                  status === PAYOUT_STATUS.APPROVED
                    ? `Your $${payout.amount.toFixed(2)} credit for "${place?.name ?? 'a place'}" was approved.`
                    : `Your credit for "${place?.name ?? 'a place'}" was not approved${note.trim() ? `: ${note.trim()}` : '.'}`,
                placeId:      payout.placeId,
                payoutId,
                createdAt:    nowISO(),
                read:         false,
                targetUserId: payout.userId,
              }
            : null;

        set((s) => ({
          payoutLedger: s.payoutLedger.map((e) =>
            e.id === payoutId ? withPayoutStatus(e, status, { by: currentUser.id, note: note.trim() || null }) : e,
          ),
          activityFeed: activityEntry ? [activityEntry, ...s.activityFeed] : s.activityFeed,
        }));
      },

      /**
       * markPayoutPaid — admin records that an approved credit has been paid.
       *   paidVia:    'stripe_connect' when the app sent the transfer through
       *               your payments server, 'manual' when paid outside the app.
       *   transferId: the Stripe transfer id returned by your server (or null).
       * Only APPROVED credits can be paid.
       */
      markPayoutPaid: (payoutId, { paidVia = 'manual', transferId = null, note = '' } = {}) => {
        const { currentUser } = get();
        if (currentUser.role !== USER_ROLES.ADMIN) {
          throw new Error('markPayoutPaid: admin role required');
        }
        const payout = get().payoutLedger.find((e) => e.id === payoutId);
        if (!payout) throw new Error(`markPayoutPaid: payout ${payoutId} not found`);
        if (payout.status !== PAYOUT_STATUS.APPROVED) {
          throw new Error(`markPayoutPaid: credit must be approved first (currently ${payout.status})`);
        }
        const place = get().places.find((p) => p.id === payout.placeId) || null;

        const activityEntry = {
          id:           generateId('activity'),
          type:         'payout_paid',
          message:      `Your $${payout.amount.toFixed(2)} payout for "${place?.name ?? 'a place'}" has been sent${paidVia === 'stripe_connect' ? ' through Stripe' : ''}.`,
          placeId:      payout.placeId,
          payoutId,
          createdAt:    nowISO(),
          read:         false,
          targetUserId: payout.userId,
        };

        set((s) => ({
          payoutLedger: s.payoutLedger.map((e) =>
            e.id === payoutId
              ? withPayoutStatus(e, PAYOUT_STATUS.PAID, { by: currentUser.id, note: note.trim() || null, transferId, paidVia })
              : e,
          ),
          activityFeed: [activityEntry, ...s.activityFeed],
        }));
      },

      getPayoutTotals: () => {
        const { payoutLedger, appSettings } = get();
        const sum = (st) =>
          payoutLedger
            .filter((e) => e.status === st)
            .reduce((t, e) => t + e.amount, 0);
        return {
          pending:           sum(PAYOUT_STATUS.PENDING),
          approved:          sum(PAYOUT_STATUS.APPROVED),
          paid:              sum(PAYOUT_STATUS.PAID),
          rejected:          sum(PAYOUT_STATUS.REJECTED),
          currency:          'USD',
          contributionCount: payoutLedger.filter(
            (e) => e.status !== PAYOUT_STATUS.REJECTED,
          ).length,
          payoutAmountUSD:   appSettings.payoutAmountUSD,
        };
      },

      // =======================================================================
      // DONATIONS  (local record; the charge itself is made by Stripe)
      // =======================================================================
      recordDonation: ({ amount, currency = 'usd', paymentIntentId = null }) => {
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('recordDonation: amount must be a positive number');
        }
        const entry = {
          id:              generateId('donation'),
          userId:          get().currentUser.id,
          amount,
          currency:        currency.toLowerCase(),
          paymentIntentId,
          createdAt:       nowISO(),
        };
        set((s) => ({ donations: [entry, ...s.donations] }));
        return entry;
      },

      // =======================================================================
      // OFFICIAL AMENITY MANAGEMENT  (mod / admin)
      // =======================================================================
      addOfficialAmenity: ({ label, group, isVending = false }) => {
        const { currentUser } = get();
        if (
          currentUser.role !== USER_ROLES.MOD &&
          currentUser.role !== USER_ROLES.ADMIN
        ) throw new Error('addOfficialAmenity: insufficient role');

        if (!label?.trim()) throw new Error('addOfficialAmenity: label required');
        if (!Object.values(AMENITY_GROUPS).includes(group))
          throw new Error(`addOfficialAmenity: invalid group "${group}"`);

        const key =
          'custom_' +
          label.trim().toLowerCase()
            .replace(/[^a-z0-9 ]/g, '')
            .replace(/\s+/g, '_');

        if (get().officialAmenities.find((a) => a.key === key))
          throw new Error(`addOfficialAmenity: key "${key}" already exists`);

        const newAmenity = buildOfficialAmenity({
          key, label: label.trim(), group, isVending,
          addedBy: currentUser.id,
        });

        set((s) => ({ officialAmenities: [...s.officialAmenities, newAmenity] }));
        return newAmenity;
      },

      updateAmenityLabel: (key, newLabel) => {
        const { currentUser } = get();
        if (
          currentUser.role !== USER_ROLES.MOD &&
          currentUser.role !== USER_ROLES.ADMIN
        ) throw new Error('updateAmenityLabel: insufficient role');

        set((s) => ({
          officialAmenities: s.officialAmenities.map((a) =>
            a.key === key ? { ...a, label: newLabel.trim() } : a,
          ),
        }));
      },

      setAmenityActive: (key, isActive) => {
        const { currentUser } = get();
        if (
          currentUser.role !== USER_ROLES.MOD &&
          currentUser.role !== USER_ROLES.ADMIN
        ) throw new Error('setAmenityActive: insufficient role');

        set((s) => ({
          officialAmenities: s.officialAmenities.map((a) =>
            a.key === key ? { ...a, isActive } : a,
          ),
        }));
      },

      getActiveAmenities: () =>
        get().officialAmenities.filter((a) => a.isActive),

      // =======================================================================
      // USER CUSTOM AMENITY SUBMISSIONS
      // =======================================================================
      submitCustomAmenity: ({ label, suggestedGroup, placeId = null }) => {
        if (!label?.trim()) throw new Error('submitCustomAmenity: label required');
        if (label.trim().length > CUSTOM_AMENITY_MAX_LABEL_LENGTH)
          throw new Error(
            `submitCustomAmenity: label exceeds ${CUSTOM_AMENITY_MAX_LABEL_LENGTH} characters`,
          );
        if (!Object.values(AMENITY_GROUPS).includes(suggestedGroup))
          throw new Error(`submitCustomAmenity: invalid group "${suggestedGroup}"`);

        const { currentUser } = get();
        const submission = {
          id:              generateId('csub'),
          submittedBy:     currentUser.id,
          label:           label.trim(),
          suggestedGroup,
          placeId,
          status:          CUSTOM_AMENITY_STATUS.PENDING,
          rejectionReason: null,
          officialKey:     null,
          createdAt:       nowISO(),
          updatedAt:       nowISO(),
        };

        set((s) => ({
          customAmenitySubmissions: [submission, ...s.customAmenitySubmissions],
        }));
        return submission;
      },

      approveCustomAmenity: (submissionId) => {
        const { currentUser, customAmenitySubmissions, places } = get();
        if (
          currentUser.role !== USER_ROLES.MOD &&
          currentUser.role !== USER_ROLES.ADMIN
        ) throw new Error('approveCustomAmenity: insufficient role');

        const submission = customAmenitySubmissions.find((s) => s.id === submissionId);
        if (!submission)
          throw new Error(`approveCustomAmenity: submission ${submissionId} not found`);
        if (submission.status !== CUSTOM_AMENITY_STATUS.PENDING)
          throw new Error(`approveCustomAmenity: already ${submission.status}`);

        const newAmenity = buildOfficialAmenity({
          key: 'custom_' + submission.label.toLowerCase()
            .replace(/[^a-z0-9 ]/g, '')
            .replace(/\s+/g, '_'),
          label:     submission.label,
          group:     submission.suggestedGroup,
          isVending: submission.suggestedGroup === AMENITY_GROUPS.VENDING,
          addedBy:   currentUser.id,
        });

        const updatedPlaces = places.map((p) => {
          if (!p.customAmenityIds?.includes(submissionId)) return p;
          return {
            ...p,
            amenities:       { ...p.amenities, [newAmenity.key]: true },
            customAmenityIds: p.customAmenityIds.filter((id) => id !== submissionId),
          };
        });

        const activityEntry = {
          id:           generateId('activity'),
          type:         'custom_amenity_approved',
          message:      `Your suggested amenity "${submission.label}" was approved and added to the app.`,
          submissionId,
          createdAt:    nowISO(),
          read:         false,
          targetUserId: submission.submittedBy,
        };

        set((s) => ({
          officialAmenities: [...s.officialAmenities, newAmenity],
          places:            updatedPlaces,
          customAmenitySubmissions: s.customAmenitySubmissions.map((sub) =>
            sub.id === submissionId
              ? { ...sub, status: CUSTOM_AMENITY_STATUS.APPROVED, officialKey: newAmenity.key, updatedAt: nowISO() }
              : sub,
          ),
          activityFeed: [activityEntry, ...s.activityFeed],
        }));

        return newAmenity;
      },

      rejectCustomAmenity: (submissionId, reason = '') => {
        const { currentUser } = get();
        if (
          currentUser.role !== USER_ROLES.MOD &&
          currentUser.role !== USER_ROLES.ADMIN
        ) throw new Error('rejectCustomAmenity: insufficient role');

        const submission = get().customAmenitySubmissions.find(
          (s) => s.id === submissionId,
        );

        const activityEntry = submission
          ? {
              id:           generateId('activity'),
              type:         'custom_amenity_rejected',
              message:      `Your suggested amenity "${submission.label}" was not added${reason ? ': ' + reason : '.'}`,
              submissionId,
              createdAt:    nowISO(),
              read:         false,
              targetUserId: submission.submittedBy,
            }
          : null;

        set((s) => ({
          customAmenitySubmissions: s.customAmenitySubmissions.map((sub) =>
            sub.id === submissionId
              ? { ...sub, status: CUSTOM_AMENITY_STATUS.REJECTED, rejectionReason: reason.trim() || null, updatedAt: nowISO() }
              : sub,
          ),
          activityFeed: activityEntry
            ? [activityEntry, ...s.activityFeed]
            : s.activityFeed,
        }));
      },

      getPendingSubmissions: () =>
        get().customAmenitySubmissions.filter(
          (s) => s.status === CUSTOM_AMENITY_STATUS.PENDING,
        ),

      // =======================================================================
      // ACTIVITY FEED
      // =======================================================================
      markActivityRead: (activityId) =>
        set((s) => ({
          activityFeed: s.activityFeed.map((a) =>
            a.id === activityId ? { ...a, read: true } : a,
          ),
        })),

      markAllActivityRead: () =>
        set((s) => ({
          activityFeed: s.activityFeed.map((a) => ({ ...a, read: true })),
        })),

      getUnreadActivityCount: () =>
        get().activityFeed.filter((a) => !a.read).length,

      // =======================================================================
      // CO-BRANDING  (admin only)
      // =======================================================================
      _requireAdmin: (action) => {
        if (get().currentUser.role !== USER_ROLES.ADMIN) {
          throw new Error(`${action}: admin role required`);
        }
      },

      /**
       * ensureCoBranding — returns the place's co-branding profile, creating it
       * on first access. Read-only callers should use `s.coBranding[placeId]`.
       */
      ensureCoBranding: (placeId) => {
        get()._requireAdmin('ensureCoBranding');
        const existing = get().coBranding[placeId];
        if (existing) return existing;
        if (!get().places.some((p) => p.id === placeId)) {
          throw new Error(`ensureCoBranding: place ${placeId} not found`);
        }
        const profile = buildCoBrandingProfile(placeId);
        set((s) => ({ coBranding: { ...s.coBranding, [placeId]: profile } }));
        return profile;
      },

      _patchCoBranding: (placeId, updater) => {
        const current = get().coBranding[placeId] || get().ensureCoBranding(placeId);
        const next    = { ...updater(current), updatedAt: nowISO() };
        set((s) => ({ coBranding: { ...s.coBranding, [placeId]: next } }));
        return next;
      },

      setPartnershipStatus: (placeId, status) => {
        get()._requireAdmin('setPartnershipStatus');
        if (!Object.values(PARTNERSHIP_STATUS).includes(status)) {
          throw new Error(`setPartnershipStatus: invalid status "${status}"`);
        }
        return get()._patchCoBranding(placeId, (p) => ({ ...p, status }));
      },

      /** setCoBrandingLookup — store exactly what OpenStreetMap returned. */
      setCoBrandingLookup: (placeId, lookup) => {
        get()._requireAdmin('setCoBrandingLookup');
        return get()._patchCoBranding(placeId, (p) => ({
          ...p,
          business: { ...p.business, lookup: lookup || null },
        }));
      },

      updateCoBrandingContact: (placeId, patch) => {
        get()._requireAdmin('updateCoBrandingContact');
        const allowed = ['contactName', 'contactEmail', 'contactPhone', 'website'];
        const clean = {};
        for (const key of allowed) {
          if (patch[key] !== undefined) {
            clean[key] = String(patch[key]).trim().slice(0, COBRANDING_LIMITS.contactFieldMaxLength);
          }
        }
        return get()._patchCoBranding(placeId, (p) => ({ ...p, business: { ...p.business, ...clean } }));
      },

      updateCoBrandingNotes: (placeId, notes) => {
        get()._requireAdmin('updateCoBrandingNotes');
        return get()._patchCoBranding(placeId, (p) => ({
          ...p,
          notes: String(notes || '').slice(0, COBRANDING_LIMITS.notesMaxLength),
        }));
      },

      /**
       * updateCoBrandingBanner — patch banner fields. Enforces the runtime
       * headline length and the item cap from appSettings.
       */
      updateCoBrandingBanner: (placeId, patch) => {
        get()._requireAdmin('updateCoBrandingBanner');
        const { appSettings } = get();
        return get()._patchCoBranding(placeId, (p) => {
          const banner = { ...p.banner };
          if (patch.enabled          !== undefined) banner.enabled          = !!patch.enabled;
          if (patch.showOnDetails    !== undefined) banner.showOnDetails    = !!patch.showOnDetails;
          if (patch.showOnNavigation !== undefined) banner.showOnNavigation = !!patch.showOnNavigation;
          if (patch.headline !== undefined) {
            banner.headline = String(patch.headline).slice(0, appSettings.cobrandingHeadlineMaxLength);
          }
          if (patch.courtesyMessage !== undefined) {
            banner.courtesyMessage = String(patch.courtesyMessage).slice(0, COBRANDING_LIMITS.courtesyMessageMaxLength);
          }
          return { ...p, banner };
        });
      },

      addCoBrandingItem: (placeId, { name, price = '' }) => {
        get()._requireAdmin('addCoBrandingItem');
        const { appSettings } = get();
        const trimmed = (name || '').trim();
        if (!trimmed) throw new Error('addCoBrandingItem: item name required');
        const profile = get().coBranding[placeId] || get().ensureCoBranding(placeId);
        if (profile.banner.items.length >= appSettings.cobrandingMaxSuggestedItems) {
          throw new Error(`addCoBrandingItem: a banner may list at most ${appSettings.cobrandingMaxSuggestedItems} items`);
        }
        const item = buildSuggestedItem({
          name:  trimmed.slice(0, COBRANDING_LIMITS.itemNameMaxLength),
          price: String(price || '').slice(0, COBRANDING_LIMITS.itemPriceMaxLength),
        });
        get()._patchCoBranding(placeId, (p) => ({ ...p, banner: { ...p.banner, items: [...p.banner.items, item] } }));
        return item;
      },

      updateCoBrandingItem: (placeId, itemId, patch) => {
        get()._requireAdmin('updateCoBrandingItem');
        return get()._patchCoBranding(placeId, (p) => ({
          ...p,
          banner: {
            ...p.banner,
            items: p.banner.items.map((i) =>
              i.id !== itemId
                ? i
                : {
                    ...i,
                    name:  patch.name  !== undefined ? String(patch.name).trim().slice(0, COBRANDING_LIMITS.itemNameMaxLength) : i.name,
                    price: patch.price !== undefined ? String(patch.price).trim().slice(0, COBRANDING_LIMITS.itemPriceMaxLength) : i.price,
                  },
            ),
          },
        }));
      },

      removeCoBrandingItem: (placeId, itemId) => {
        get()._requireAdmin('removeCoBrandingItem');
        return get()._patchCoBranding(placeId, (p) => ({
          ...p,
          banner: { ...p.banner, items: p.banner.items.filter((i) => i.id !== itemId) },
        }));
      },

      /**
       * logOutreach — record a message sent (or a call / visit). A first
       * contact moves NOT_CONTACTED → CONTACTED automatically.
       */
      logOutreach: (placeId, { channel, templateKey = null, subject = '', note = '' }) => {
        get()._requireAdmin('logOutreach');
        if (!Object.values(OUTREACH_CHANNEL).includes(channel)) {
          throw new Error(`logOutreach: invalid channel "${channel}"`);
        }
        const entry = buildOutreachEntry({
          channel,
          templateKey,
          subject,
          note: String(note || '').slice(0, COBRANDING_LIMITS.outreachNoteMaxLength),
          by:   get().currentUser.id,
        });
        get()._patchCoBranding(placeId, (p) => ({
          ...p,
          status:      p.status === PARTNERSHIP_STATUS.NOT_CONTACTED ? PARTNERSHIP_STATUS.CONTACTED : p.status,
          outreachLog: [entry, ...p.outreachLog],
        }));
        return entry;
      },

      // =======================================================================
      // DEV UTILITY
      // =======================================================================
      resetToSeed: () =>
        set({
          hasCompletedOnboarding:   false,
          legalAcceptance:          null,
          contributorAcceptance:    null,
          appSettings:              { ...DEFAULT_APP_SETTINGS },
          places:                   SEED_PLACES,
          savedPlaceIds:            [],
          reviews:                  SEED_REVIEWS,
          payoutLedger:             SEED_PAYOUTS,
          donations:                [],
          officialAmenities:        OFFICIAL_AMENITIES_SEED,
          customAmenitySubmissions: [],
          moderationQueue:          [],
          activityFeed:             [],
          coBranding:               {},
        }),
    }),
    {
      name:    'places2go-default-mode-v3',
      storage: createJSONStorage(() => AsyncStorage),
      version: 4,
      partialize: (state) => ({
        currentUser:              state.currentUser,
        hasCompletedOnboarding:   state.hasCompletedOnboarding,
        legalAcceptance:          state.legalAcceptance,
        contributorAcceptance:    state.contributorAcceptance,
        appSettings:              state.appSettings,
        places:                   state.places,
        savedPlaceIds:            state.savedPlaceIds,
        reviews:                  state.reviews,
        payoutLedger:             state.payoutLedger,
        donations:                state.donations,
        officialAmenities:        state.officialAmenities,
        customAmenitySubmissions: state.customAmenitySubmissions,
        moderationQueue:          state.moderationQueue,
        activityFeed:             state.activityFeed,
        coBranding:               state.coBranding,
      }),
      /**
       * migrate — v3 → v4. Adds the fields introduced with co-branding,
       * "no public restroom" reports, sign-in, legal acceptance, donations and
       * the payout trail. Existing data is kept; new settings keys take their
       * defaults while values the admin already changed are preserved.
       */
      migrate: (persisted, version) => {
        if (!persisted) return persisted;
        if (version >= 4) return persisted;
        const p = { ...persisted };

        p.appSettings = { ...DEFAULT_APP_SETTINGS, ...(p.appSettings || {}) };

        p.currentUser = {
          ...(p.currentUser || {}),
          auth:          p.currentUser?.auth ?? null,
          stripeConnect: p.currentUser?.stripeConnect ?? null,
          payoutMethod:  p.currentUser?.payoutMethod ?? null,
        };

        p.places = (p.places || []).map((pl) => ({
          ...pl,
          hasPublicRestroom:  pl.hasPublicRestroom !== false,
          noRestroomReason:   pl.hasPublicRestroom === false ? (pl.noRestroomReason || 'not_public') : null,
          reportVerification: pl.reportVerification ?? null,
          reviewLock:         pl.reviewLock ?? null, // existing places stay open to reviews
        }));

        p.payoutLedger = (p.payoutLedger || []).map((e) => ({
          ...e,
          kind:       e.kind || PAYOUT_KIND.PLACE_REVIEW,
          transferId: e.transferId ?? null,
          paidVia:    e.paidVia ?? null,
          history:    Array.isArray(e.history) && e.history.length
            ? e.history
            : [{ status: e.status, at: e.updatedAt || e.createdAt, by: null, note: null }],
        }));

        p.legalAcceptance       = p.legalAcceptance ?? null;
        p.contributorAcceptance = p.contributorAcceptance ?? null;
        p.donations             = p.donations || [];
        p.coBranding            = p.coBranding || {};
        return p;
      },
    },
  ),
);

export default useStore;

// places2go — Payout method facts, tooltips and availability rules
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// One place for what each payout method really is, shown as tooltips to
// contributors (Payout method screen) and administrators (Admin Settings), and
// the country / platform rules the app enforces before a method can be chosen.
//
// Sources for the rules (checked 2026-09-29):
//   • Apple Cash: US only; needs an iPhone with Apple Cash set up in Wallet.
//   • Google Pay person-to-person: Google discontinued the US Google Pay app and
//     US P2P payments on June 4, 2024; the app with P2P continues in India and
//     Singapore. (9to5google.com/2024/02/22/gpay-app-p2p, 9to5google.com/2024/06/09/gpay-us)
//   • Cash App: US and UK accounts; Zelle: US bank accounts.
//   • None of Apple, Google, Cash App or Zelle offers an API for sending money
//     to a person, so those payouts are sent by the administrator by hand.

import { Platform } from 'react-native';

export const PAYOUT_METHODS = {
  STRIPE:     'stripe_connect',
  CASH_APP:   'cash_app',
  ZELLE:      'zelle',
  APPLE_CASH: 'apple_cash',   // "Apple Pay" to the contributor: money lands in Apple Cash
  GOOGLE_PAY: 'google_pay',
};

export const PAYOUT_METHOD_LABELS = {
  [PAYOUT_METHODS.STRIPE]:     'Stripe',
  [PAYOUT_METHODS.CASH_APP]:   'Cash App',
  [PAYOUT_METHODS.ZELLE]:      'Zelle',
  [PAYOUT_METHODS.APPLE_CASH]: 'Apple Pay',
  [PAYOUT_METHODS.GOOGLE_PAY]: 'Google Pay',
};

// Methods that identify the recipient by a phone number or email address.
export const CONTACT_PAYOUT_METHODS = [PAYOUT_METHODS.ZELLE, PAYOUT_METHODS.APPLE_CASH, PAYOUT_METHODS.GOOGLE_PAY];

export const MANUAL_PAYOUT_NOTE =
  'Neither Apple nor Google offers an API for sending money to a person, so like Cash App and Zelle this is manual: the places2go administrator sends the payment from their own phone, then marks the credit paid. Only Stripe pays automatically.';

// ---------------------------------------------------------------------------
// Rules — countryCodes: ISO 3166-1 alpha-2 the recipient must be in (null = any)
//         platforms:    OS the recipient must be using (null = any)
// ---------------------------------------------------------------------------
export const PAYOUT_METHOD_RULES = {
  [PAYOUT_METHODS.STRIPE]:     { countryCodes: null,         platforms: null },
  [PAYOUT_METHODS.CASH_APP]:   { countryCodes: ['US', 'GB'], platforms: null },
  [PAYOUT_METHODS.ZELLE]:      { countryCodes: ['US'],       platforms: null },
  [PAYOUT_METHODS.APPLE_CASH]: { countryCodes: ['US'],       platforms: ['ios'] },
  [PAYOUT_METHODS.GOOGLE_PAY]: { countryCodes: ['IN', 'SG'], platforms: null },
};

const COUNTRY_NAMES = { US: 'the United States', GB: 'the United Kingdom', IN: 'India', SG: 'Singapore' };
const listCountries = (codes) => codes.map((c) => COUNTRY_NAMES[c] || c).join(' or ');

// ---------------------------------------------------------------------------
// Tooltips shown to contributors under each option
// ---------------------------------------------------------------------------
export const PAYOUT_METHOD_TOOLTIPS = {
  [PAYOUT_METHODS.STRIPE]:
    'Stripe pays your bank account automatically once the administrator approves a credit. Stripe verifies your identity and holds your bank details; places2go never sees them.',
  [PAYOUT_METHODS.CASH_APP]:
    `${MANUAL_PAYOUT_NOTE}\n\nCash App accounts are available in the United States and the United Kingdom. Payments go to the exact $Cashtag you enter.`,
  [PAYOUT_METHODS.ZELLE]:
    `${MANUAL_PAYOUT_NOTE}\n\nZelle works between US bank accounts. Payments go to the email or US mobile number enrolled with Zelle at your bank.`,
  [PAYOUT_METHODS.APPLE_CASH]:
    `${MANUAL_PAYOUT_NOTE}\n\n"Apple Pay" payouts land in your Apple Cash, which requires an iPhone with Apple Cash set up in Wallet, and the administrator sends from an iPhone (Messages or Wallet). Both parties must be in the United States.`,
  [PAYOUT_METHODS.GOOGLE_PAY]:
    `${MANUAL_PAYOUT_NOTE}\n\nGoogle shut down the US Google Pay app and person-to-person sending in the US on June 4, 2024. Google Pay person-to-person payments continue in India and Singapore, so this option is offered only there.`,
};

// ---------------------------------------------------------------------------
// Tooltips shown to administrators under the "Offer …" switches
// ---------------------------------------------------------------------------
export const PAYOUT_SETTING_TOOLTIPS = {
  cashAppEnabled:
    `${MANUAL_PAYOUT_NOTE} Contributors outside the United States and the United Kingdom cannot choose Cash App.`,
  zelleEnabled:
    `${MANUAL_PAYOUT_NOTE} Zelle is offered only to contributors located in the United States.`,
  applePayPayoutsEnabled:
    `${MANUAL_PAYOUT_NOTE}\n\n"Apple Pay" payouts land in the contributor's Apple Cash, which requires an iPhone with Apple Cash set up, and you must send from an iPhone (Messages or Wallet). Both parties must be in the US, so the app offers it only to contributors located in the United States using an iPhone.`,
  googlePayPayoutsEnabled:
    `${MANUAL_PAYOUT_NOTE}\n\nGoogle shut down the US Google Pay app in 2024 and person-to-person sending in the US went with it; it still exists in India and Singapore, so the app offers this only to contributors located there. If you cannot send with Google Pay yourself, turn this off.`,
};

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------
/**
 * payoutMethodAvailability(methodKey, { countryCode, platform })
 *   countryCode — ISO alpha-2 from the contributor's current location, or null
 *                 when it is not known yet
 *   platform    — 'ios' | 'android' | 'web' (defaults to Platform.OS)
 * Returns { available: boolean, reason: string|null, needsLocation: boolean }.
 * A method with a country rule is unavailable until the location is known.
 */
export function payoutMethodAvailability(methodKey, { countryCode = null, platform = Platform.OS } = {}) {
  const rule = PAYOUT_METHOD_RULES[methodKey];
  if (!rule) return { available: false, reason: 'Unknown payout method', needsLocation: false };

  if (rule.platforms && !rule.platforms.includes(platform)) {
    return {
      available: false,
      needsLocation: false,
      reason: methodKey === PAYOUT_METHODS.APPLE_CASH
        ? 'Apple Cash can only be received on an iPhone. Open places2go on your iPhone to choose this.'
        : `Not available on ${platform}.`,
    };
  }

  if (rule.countryCodes) {
    if (!countryCode) {
      return { available: false, needsLocation: true, reason: `Available in ${listCountries(rule.countryCodes)}. Allow location so we can confirm where you are.` };
    }
    if (!rule.countryCodes.includes(countryCode)) {
      return { available: false, needsLocation: false, reason: `Not available in your location — offered only in ${listCountries(rule.countryCodes)}.` };
    }
  }

  return { available: true, reason: null, needsLocation: false };
}

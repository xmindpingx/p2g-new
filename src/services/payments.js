// places2go — Payments server client (Stripe donations + Stripe Connect payouts)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// The app never holds a Stripe secret key. Everything that needs one runs on
// YOUR server; this file is the client for that server. The URL comes from
// appSettings.paymentsApiBaseUrl (Admin Settings → Stripe).
//
// Server contract (implemented by server/stripe-server.example.js):
//
//   POST /donations/intent
//        body   { amount: <cents>, currency: 'usd', userId, email? }
//        200    { clientSecret, paymentIntentId }
//
//   POST /connect/onboarding-link
//        body   { userId, returnUrl, refreshUrl }
//        200    { url, accountId }
//
//   GET  /connect/status?userId=…
//        200    { accountId, detailsSubmitted, payoutsEnabled }
//
//   POST /payouts/send
//        body   { payoutId, userId, amount: <cents>, currency: 'usd', placeName }
//        200    { transferId }
//        4xx    { error: 'reason' }   e.g. the contributor has no payouts-enabled account
//
//   POST /live/positions   and   GET /live/positions?lat=&lon=&radiusKm=
//        see services/liveMap.js
//
// Every function throws a PaymentsError with a readable message on failure.

export class PaymentsError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name   = 'PaymentsError';
    this.status = status;
    this.cause  = cause;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

export const isPaymentsApiConfigured = (appSettings) =>
  typeof appSettings?.paymentsApiBaseUrl === 'string' && /^https?:\/\//i.test(appSettings.paymentsApiBaseUrl.trim());

export const isStripeConfigured = (appSettings) =>
  typeof appSettings?.stripePublishableKey === 'string' && /^pk_(test|live)_/.test(appSettings.stripePublishableKey.trim());

export const isStripeLiveKey = (appSettings) => /^pk_live_/.test((appSettings?.stripePublishableKey || '').trim());

const baseUrl = (appSettings) => appSettings.paymentsApiBaseUrl.trim().replace(/\/$/, '');

async function request(appSettings, path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!isPaymentsApiConfigured(appSettings)) {
    throw new PaymentsError('Payments server URL is not set (Admin Settings → Stripe).');
  }
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl(appSettings)}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    body ? JSON.stringify(body) : undefined,
      signal:  controller.signal,
    });
    let data = null;
    try { data = await response.json(); } catch (err) { data = null; }
    if (!response.ok) {
      throw new PaymentsError(data?.error || `Payments server responded with status ${response.status}`, { status: response.status });
    }
    return data;
  } catch (err) {
    if (err instanceof PaymentsError) throw err;
    if (err.name === 'AbortError') throw new PaymentsError('Payments server did not respond in time', { cause: err });
    throw new PaymentsError('Could not reach the payments server', { cause: err });
  } finally {
    clearTimeout(timeoutId);
  }
}

export const toCents = (amountUsd) => Math.round(Number(amountUsd) * 100);

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------
export async function createDonationIntent(appSettings, { amountUsd, currency, userId, email = null }) {
  const amount = toCents(amountUsd);
  if (!Number.isInteger(amount) || amount <= 0) throw new PaymentsError('Enter a valid donation amount');
  const data = await request(appSettings, '/donations/intent', {
    method: 'POST',
    body:   { amount, currency: (currency || 'usd').toLowerCase(), userId, email },
  });
  if (!data?.clientSecret) throw new PaymentsError('Payments server did not return a client secret');
  return { clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId || null };
}

// ---------------------------------------------------------------------------
// Stripe Connect (contributor payouts)
// ---------------------------------------------------------------------------
export async function createConnectOnboardingLink(appSettings, { userId, returnUrl, refreshUrl }) {
  const data = await request(appSettings, '/connect/onboarding-link', {
    method: 'POST',
    body:   { userId, returnUrl, refreshUrl },
  });
  if (!data?.url) throw new PaymentsError('Payments server did not return an onboarding link');
  return { url: data.url, accountId: data.accountId || null };
}

export async function fetchConnectStatus(appSettings, { userId }) {
  const data = await request(appSettings, `/connect/status?userId=${encodeURIComponent(userId)}`);
  return {
    accountId:        data?.accountId || null,
    detailsSubmitted: !!data?.detailsSubmitted,
    payoutsEnabled:   !!data?.payoutsEnabled,
  };
}

export async function sendPayout(appSettings, { payoutId, userId, amountUsd, currency = 'usd', placeName = '' }) {
  const data = await request(appSettings, '/payouts/send', {
    method: 'POST',
    body:   { payoutId, userId, amount: toCents(amountUsd), currency: currency.toLowerCase(), placeName },
  });
  if (!data?.transferId) throw new PaymentsError('Payments server did not return a transfer id');
  return { transferId: data.transferId };
}

// ---------------------------------------------------------------------------
// Cash App deep link (manual payouts / donations)
// ---------------------------------------------------------------------------
/**
 * cashAppUrl(cashtag, amountUsd?) — opens the recipient's Cash App profile;
 * with an amount, Cash App pre-fills it. Payment is still confirmed by the
 * person paying, inside Cash App.
 */
export function cashAppUrl(cashtag, amountUsd = null) {
  const tag = String(cashtag || '').trim().replace(/^\$/, '');
  if (!tag) return null;
  const base = `https://cash.app/$${encodeURIComponent(tag)}`;
  return Number.isFinite(amountUsd) && amountUsd > 0 ? `${base}/${amountUsd.toFixed(2)}` : base;
}

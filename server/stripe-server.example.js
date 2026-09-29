// places2go — Reference payments / live-map server (Node + Express)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// The mobile app never holds a Stripe SECRET key. This server does, and
// implements the contract the app calls (src/services/payments.js and
// src/services/liveMap.js). It is a starting point: add authentication for
// your admin endpoints and persistent storage before running it for real.
//
// Setup:
//   cd server && npm init -y && npm install express stripe cors
//   STRIPE_SECRET_KEY=sk_test_... PORT=3000 node stripe-server.example.js
//
// Then in the app: Admin Settings → Stripe → Payments Server URL =
// http://<your-machine-ip>:3000 (localhost only works on a simulator).
//
// Endpoints
//   POST   /donations/intent           { amount(cents), currency, userId, email? }  → { clientSecret, paymentIntentId }
//   POST   /connect/onboarding-link    { userId, returnUrl, refreshUrl }             → { url, accountId }
//   GET    /connect/status?userId=     →  { accountId, detailsSubmitted, payoutsEnabled }
//   POST   /payouts/send               { payoutId, userId, amount(cents), currency, placeName } → { transferId }
//   POST   /live/positions             { userId, lat, lon, at }                      → { ok }
//   DELETE /live/positions             { userId }                                    → { ok }
//   GET    /live/positions?lat=&lon=&radiusKm=&exclude=                             → { positions:[{id,lat,lon,at}] }
//   POST   /photos                     (already used by src/services/uploads.js — implement per your storage)

const express = require('express');
const cors    = require('cors');
const Stripe  = require('stripe');

const PORT   = process.env.PORT || 3000;
const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error('Set STRIPE_SECRET_KEY (sk_test_… or sk_live_…) before starting.');
  process.exit(1);
}
const stripe = new Stripe(SECRET);

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// In-memory stores — replace with your database
// ---------------------------------------------------------------------------
const connectAccounts = new Map(); // userId → stripe account id
const payoutsSent     = new Map(); // payoutId → transfer id (idempotency)
const livePositions   = new Map(); // userId → { lat, lon, at }

const LIVE_TTL_MS = 5 * 60 * 1000;

const bad = (res, status, error) => res.status(status).json({ error });

// ---------------------------------------------------------------------------
// Donations — PaymentIntent for the app's PaymentSheet
// ---------------------------------------------------------------------------
app.post('/donations/intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', userId, email } = req.body || {};
    if (!Number.isInteger(amount) || amount < 50) return bad(res, 400, 'amount must be an integer number of cents (min 50)');
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: String(currency).toLowerCase(),
      automatic_payment_methods: { enabled: true },
      receipt_email: email || undefined,
      description: 'places2go donation',
      metadata: { userId: userId || '', kind: 'donation' },
    });
    res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (err) {
    bad(res, 500, err.message);
  }
});

// ---------------------------------------------------------------------------
// Stripe Connect (Express accounts) — contributor payouts
// ---------------------------------------------------------------------------
app.post('/connect/onboarding-link', async (req, res) => {
  try {
    const { userId, returnUrl, refreshUrl } = req.body || {};
    if (!userId || !returnUrl || !refreshUrl) return bad(res, 400, 'userId, returnUrl and refreshUrl are required');

    let accountId = connectAccounts.get(userId);
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        capabilities: { transfers: { requested: true } },
        metadata: { userId },
      });
      accountId = account.id;
      connectAccounts.set(userId, accountId);
    }
    const link = await stripe.accountLinks.create({
      account:     accountId,
      refresh_url: refreshUrl,
      return_url:  returnUrl,
      type:        'account_onboarding',
    });
    res.json({ url: link.url, accountId });
  } catch (err) {
    bad(res, 500, err.message);
  }
});

app.get('/connect/status', async (req, res) => {
  try {
    const userId = req.query.userId;
    const accountId = connectAccounts.get(userId);
    if (!accountId) return res.json({ accountId: null, detailsSubmitted: false, payoutsEnabled: false });
    const account = await stripe.accounts.retrieve(accountId);
    res.json({ accountId, detailsSubmitted: !!account.details_submitted, payoutsEnabled: !!account.payouts_enabled });
  } catch (err) {
    bad(res, 500, err.message);
  }
});

// Admin action: transfer an approved credit to the contributor's account.
// PROTECT THIS ROUTE with admin authentication before going live.
app.post('/payouts/send', async (req, res) => {
  try {
    const { payoutId, userId, amount, currency = 'usd', placeName = '' } = req.body || {};
    if (!payoutId || !userId || !Number.isInteger(amount) || amount <= 0) return bad(res, 400, 'payoutId, userId and amount (cents) are required');
    if (payoutsSent.has(payoutId)) return res.json({ transferId: payoutsSent.get(payoutId) });

    const accountId = connectAccounts.get(userId);
    if (!accountId) return bad(res, 409, 'This contributor has not linked a Stripe account');
    const account = await stripe.accounts.retrieve(accountId);
    if (!account.payouts_enabled) return bad(res, 409, "This contributor's Stripe account is not ready for payouts yet");

    const transfer = await stripe.transfers.create(
      {
        amount,
        currency: String(currency).toLowerCase(),
        destination: accountId,
        description: `places2go contribution credit${placeName ? ` — ${placeName}` : ''}`,
        metadata: { payoutId, userId },
      },
      { idempotencyKey: `payout_${payoutId}` },
    );
    payoutsSent.set(payoutId, transfer.id);
    res.json({ transferId: transfer.id });
  } catch (err) {
    bad(res, 500, err.message);
  }
});

// ---------------------------------------------------------------------------
// Live map — opt-in, coarsened positions with a short TTL
// ---------------------------------------------------------------------------
const kmBetween = (a, b) => {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

app.post('/live/positions', (req, res) => {
  const { userId, lat, lon, at } = req.body || {};
  if (!userId || !Number.isFinite(lat) || !Number.isFinite(lon)) return bad(res, 400, 'userId, lat and lon are required');
  livePositions.set(userId, { lat, lon, at: Number.isFinite(at) ? at : Date.now() });
  res.json({ ok: true });
});

app.delete('/live/positions', (req, res) => {
  const { userId } = req.body || {};
  if (userId) livePositions.delete(userId);
  res.json({ ok: true });
});

app.get('/live/positions', (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  const radiusKm = Number(req.query.radiusKm) || 10;
  const exclude = req.query.exclude;
  const now = Date.now();
  const positions = [];
  for (const [userId, p] of livePositions) {
    if (now - p.at > LIVE_TTL_MS) { livePositions.delete(userId); continue; }
    if (userId === exclude) continue;
    if (Number.isFinite(lat) && Number.isFinite(lon) && kmBetween({ lat, lon }, p) > radiusKm) continue;
    // Opaque id: never expose the user id to other clients
    positions.push({ id: `u_${Buffer.from(userId).toString('base64url').slice(0, 10)}`, lat: p.lat, lon: p.lon, at: p.at });
  }
  res.json({ positions });
});

app.listen(PORT, () => console.log(`places2go payments/live-map server listening on :${PORT}`));

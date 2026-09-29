// places2go — Automatic approval and payment of contribution credits
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// A credit is approved without a human only when EVERY check below passes,
// using the evidence the app already records: the presence check (GPS samples
// while Add Place was open), Ollama screening verdicts, review content,
// contributor history and rate limits. Each check is listed with its measured
// value so the admin can see exactly why a credit was or was not approved.
// Anything that fails stays PENDING for a human. Nothing is estimated.
//
// Auto-pay goes only through Stripe Connect (the one method that can be paid
// programmatically); the payments server answers 409 when the contributor has
// no linked account, and the credit then stays APPROVED for manual payment.

import useStore, { PAYOUT_STATUS, PAYOUT_KIND, USER_ROLES, AUTH_PROVIDERS } from '../store/useStore';
import { AI_STATUS, CONTENT_TYPE } from '../constants/moderation';
import { PRESENCE_LEVEL } from './presence';
import { sendPayout, isPaymentsApiConfigured } from './payments';

const dayStart = (now) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

/**
 * evaluateAutoApproval({ payout, place, review, moderationQueue, ledger, users, settings, now })
 * → { eligible, checks: [{ key, label, pass, value }] }
 * `contributor` is the user record when it is known on this device (the
 * current user), otherwise null; signed-in status is then taken from the
 * review's `authProvider` if recorded, else fails the signed-in check.
 */
export function evaluateAutoApproval({ payout, place, review, contributor = null, moderationQueue = [], ledger = [], settings, now = Date.now() }) {
  const checks = [];
  const add = (key, label, pass, value) => checks.push({ key, label, pass: !!pass, value });

  // Kind: only place + review credits are automated; "no restroom" reports need a human's verification
  add('kind', 'Credit type is place + review', payout.kind === PAYOUT_KIND.PLACE_REVIEW, payout.kind);

  // Risk flags recorded when the credit was created
  add('risk', 'No risk flags at submission', !(payout.riskFlags || []).length, (payout.riskFlags || []).join(', ') || 'none');

  // Presence evidence
  const ev = place?.visitEvidence || null;
  const acceptable = settings.autoApproveAcceptModeratePresence ? [PRESENCE_LEVEL.STRONG, PRESENCE_LEVEL.MODERATE] : [PRESENCE_LEVEL.STRONG];
  add('presence', `Presence level ${settings.autoApproveAcceptModeratePresence ? 'Strong or Moderate' : 'Strong'}`, ev && acceptable.includes(ev.level), ev?.level || 'none');
  add('mocked', 'No mock location detected', ev && ev.mockedDetected === false, ev ? String(!!ev.mockedDetected) : 'no evidence');
  add('accuracy', `Median GPS accuracy ≤ ${settings.autoApproveMaxGpsAccuracyMeters} m`,
    ev && Number.isFinite(ev.accuracyMedianM) && ev.accuracyMedianM <= settings.autoApproveMaxGpsAccuracyMeters,
    ev && Number.isFinite(ev.accuracyMedianM) ? `${ev.accuracyMedianM} m` : 'unknown');
  add('dwell', `Time within radius ≥ ${settings.autoApproveMinDwellSeconds} s`,
    ev && Number.isFinite(ev.dwellSeconds) && ev.dwellSeconds >= settings.autoApproveMinDwellSeconds,
    ev && Number.isFinite(ev.dwellSeconds) ? `${ev.dwellSeconds} s` : 'unknown');
  if (settings.autoApproveRequireRestroomFix) {
    add('restroomFix', 'Restroom spot marked', !!ev?.restroomFix, ev?.restroomFix ? `${ev.restroomFix.distanceFromPinM} m from pin` : 'not marked');
  }

  // AI screening: every queue entry for this review / place / their photos must be CLEAN
  if (settings.autoApproveRequireAiClean) {
    const photoIds = new Set([...(place?.photos || []).map((p) => p.id), ...(review?.photos || []).map((p) => p.id)]);
    const related = moderationQueue.filter((e) =>
      (e.contentType === CONTENT_TYPE.REVIEW_TEXT && e.contentRef === review?.id) ||
      (e.contentType === CONTENT_TYPE.PLACE_NOTE  && e.contentRef === place?.id) ||
      (e.contentType === CONTENT_TYPE.PHOTO       && photoIds.has(e.contentRef)));
    const notClean = related.filter((e) => e.aiStatus !== AI_STATUS.CLEAN);
    const expected = (review?.text ? 1 : 0) + (place?.notes ? 1 : 0) + photoIds.size;
    add('ai', 'AI screening CLEAN on all content', related.length >= expected && notClean.length === 0,
      `${related.length - notClean.length}/${Math.max(expected, related.length)} clean${notClean.length ? ` (${notClean.map((e) => e.aiStatus).join(', ')})` : ''}`);
  }

  // Review content
  const textLen = (review?.text || '').trim().length;
  add('text', `Review ≥ ${settings.autoApproveMinReviewChars} characters`, textLen >= settings.autoApproveMinReviewChars, `${textLen} chars`);
  const photoCount = (place?.photos || []).length + (review?.photos || []).length;
  add('photos', `≥ ${settings.autoApproveMinPhotos} photo${settings.autoApproveMinPhotos === 1 ? '' : 's'}`, photoCount >= settings.autoApproveMinPhotos, String(photoCount));

  // Contributor
  if (settings.autoApproveRequireSignedIn) {
    const provider = contributor?.auth?.provider ?? review?.authProvider ?? null;
    const signedIn = !!provider && provider !== AUTH_PROVIDERS.GUEST;
    add('signedIn', 'Contributor signed in (not a guest)', signedIn, provider || 'unknown');
  }
  const mine = ledger.filter((e) => e.userId === payout.userId && e.id !== payout.id);
  const priorApproved = mine.filter((e) => e.status === PAYOUT_STATUS.APPROVED || e.status === PAYOUT_STATUS.PAID).length;
  add('history', `≥ ${settings.autoApproveMinPriorApproved} previously approved credit${settings.autoApproveMinPriorApproved === 1 ? '' : 's'}`, priorApproved >= settings.autoApproveMinPriorApproved, String(priorApproved));
  const autoToday = mine.filter((e) => e.autoApproval && new Date(e.autoApproval.at).getTime() >= dayStart(now)).length;
  add('rate', `< ${settings.autoApproveMaxPerUserPerDay} auto-approvals today for this contributor`, autoToday < settings.autoApproveMaxPerUserPerDay, String(autoToday));

  return { eligible: checks.every((c) => c.pass), checks };
}

/** Amount already auto-paid today (USD), for the daily limit. */
export function autoPaidTodayUSD(ledger = [], now = Date.now()) {
  const start = dayStart(now);
  return ledger
    .filter((e) => e.status === PAYOUT_STATUS.PAID && e.autoPaid && new Date(e.autoPaid.at).getTime() >= start)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

let running = false;
export const isRunning = () => running;

/**
 * runAutoApproval() — evaluates every PENDING place+review credit, approves
 * the ones that pass, optionally pays them through Stripe. Resolves to
 *   { evaluated, approved, paid, payFailed, held, details: [{ id, outcome, message }] }
 */
export async function runAutoApproval() {
  if (running) throw new Error('Auto-approval is already running');
  running = true;
  const summary = { evaluated: 0, approved: 0, paid: 0, payFailed: 0, held: 0, details: [] };
  try {
    const st = useStore.getState();
    if (st.currentUser.role !== USER_ROLES.ADMIN) throw new Error('Only an administrator can run automatic approval');
    if (!st.appSettings.autoApproveEnabled) throw new Error('Automatic approval is turned off in Admin Settings');

    const pending = st.payoutLedger.filter((e) => e.status === PAYOUT_STATUS.PENDING && e.kind === PAYOUT_KIND.PLACE_REVIEW);
    for (const payout of pending) {
      const s = useStore.getState();
      const place  = s.places.find((p) => p.id === payout.placeId) || null;
      const review = s.reviews.find((r) => r.id === payout.reviewId) || null;
      const contributor = payout.userId === s.currentUser.id ? s.currentUser : null;
      const result = evaluateAutoApproval({ payout, place, review, contributor, moderationQueue: s.moderationQueue, ledger: s.payoutLedger, settings: s.appSettings });
      summary.evaluated += 1;
      if (!result.eligible) {
        summary.held += 1;
        const failed = result.checks.filter((c) => !c.pass).map((c) => `${c.label} (${c.value})`);
        summary.details.push({ id: payout.id, outcome: 'held', message: failed.join('; ') });
        continue;
      }
      s.autoApprovePayout(payout.id, result.checks);
      summary.approved += 1;
      summary.details.push({ id: payout.id, outcome: 'approved', message: `${result.checks.length} checks passed` });

      // Auto-pay through Stripe Connect only
      const settings = useStore.getState().appSettings;
      if (!settings.autoPayEnabled) continue;
      if (!isPaymentsApiConfigured(settings)) { summary.details.push({ id: payout.id, outcome: 'pay_skipped', message: 'Payments server URL not set' }); continue; }
      if (payout.amount > settings.autoPayMaxAmountUSD) { summary.details.push({ id: payout.id, outcome: 'pay_skipped', message: `Amount $${payout.amount.toFixed(2)} is above the per-credit auto-pay limit` }); continue; }
      const paidToday = autoPaidTodayUSD(useStore.getState().payoutLedger);
      if (paidToday + payout.amount > settings.autoPayDailyLimitUSD) { summary.details.push({ id: payout.id, outcome: 'pay_skipped', message: `Daily auto-pay limit reached ($${paidToday.toFixed(2)} of $${settings.autoPayDailyLimitUSD.toFixed(2)})` }); continue; }
      try {
        const { transferId } = await sendPayout(settings, { payoutId: payout.id, userId: payout.userId, amountUsd: payout.amount, currency: payout.currency || 'usd', placeName: place?.name || '' });
        useStore.getState().markPayoutPaid(payout.id, { paidVia: 'stripe_connect', transferId, note: 'Paid automatically', auto: true });
        summary.paid += 1;
        summary.details.push({ id: payout.id, outcome: 'paid', message: `Stripe transfer ${transferId}` });
      } catch (err) {
        summary.payFailed += 1;
        summary.details.push({ id: payout.id, outcome: 'pay_failed', message: err.message });
      }
    }
    return summary;
  } finally {
    running = false;
  }
}

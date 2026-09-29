// places2go — Payout statistics (pure functions)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Everything is computed from the payout ledger entries themselves — amounts,
// created dates, and the per-entry status history. Nothing is estimated.

import { PAYOUT_STATUS } from '../store/useStore';

const DAY_MS  = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const sum = (entries) => entries.reduce((t, e) => t + (Number.isFinite(e.amount) ? e.amount : 0), 0);
const round2 = (n) => Math.round(n * 100) / 100;

const earnedStatuses = new Set([PAYOUT_STATUS.APPROVED, PAYOUT_STATUS.PAID]);

const localDayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const statusAt = (entry, status) => {
  const step = (entry.history || []).find((h) => h.status === status);
  return step ? new Date(step.at).getTime() : null;
};

/**
 * bestRollingHour(entries) — the largest amount created within any 60-minute
 * window. Sliding window over creation times; returns { amount, startAt, endAt }
 * or null when there are no entries.
 */
export function bestRollingHour(entries) {
  const sorted = [...entries]
    .map((e) => ({ at: new Date(e.createdAt).getTime(), amount: e.amount }))
    .filter((e) => Number.isFinite(e.at))
    .sort((a, b) => a.at - b.at);
  if (!sorted.length) return null;
  let best = { amount: 0, startAt: null, endAt: null, count: 0 };
  let start = 0;
  let running = 0;
  for (let end = 0; end < sorted.length; end += 1) {
    running += sorted[end].amount;
    while (sorted[end].at - sorted[start].at > HOUR_MS) {
      running -= sorted[start].amount;
      start += 1;
    }
    if (running > best.amount) {
      best = { amount: round2(running), startAt: sorted[start].at, endAt: sorted[end].at, count: end - start + 1 };
    }
  }
  return best.count ? best : null;
}

/**
 * bestDay(entries) → { dayKey, amount, count } | null — by local calendar day.
 */
export function bestDay(entries) {
  const byDay = {};
  for (const e of entries) {
    const key = localDayKey(e.createdAt);
    byDay[key] = byDay[key] || { dayKey: key, amount: 0, count: 0 };
    byDay[key].amount = round2(byDay[key].amount + e.amount);
    byDay[key].count += 1;
  }
  const days = Object.values(byDay);
  if (!days.length) return null;
  return days.sort((a, b) => b.amount - a.amount || b.count - a.count)[0];
}

const averageHours = (values) => {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  return Math.round((v.reduce((t, x) => t + x, 0) / v.length / HOUR_MS) * 10) / 10;
};

/**
 * computePayoutStats(ledger, userId, now)
 * Returns every figure the Profile "Your payouts" screen shows:
 *   counts and totals per status, earned (approved + paid), lifetime total
 *   (everything not rejected), approval rate, best day, best rolling hour,
 *   this week / this month, average hours pending→approved and approved→paid,
 *   first and latest entries.
 */
export function computePayoutStats(ledger = [], userId, now = Date.now()) {
  const mine = ledger.filter((e) => e.userId === userId);
  const by   = (status) => mine.filter((e) => e.status === status);

  const pending  = by(PAYOUT_STATUS.PENDING);
  const approved = by(PAYOUT_STATUS.APPROVED);
  const paid     = by(PAYOUT_STATUS.PAID);
  const rejected = by(PAYOUT_STATUS.REJECTED);
  const earned   = mine.filter((e) => earnedStatuses.has(e.status));
  const notRejected = mine.filter((e) => e.status !== PAYOUT_STATUS.REJECTED);

  const decided      = earned.length + rejected.length;
  const approvalRate = decided ? Math.round((earned.length / decided) * 100) : null;

  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
  const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const inRange = (entries, from) => entries.filter((e) => new Date(e.createdAt).getTime() >= from.getTime());

  const sortedByDate = [...mine].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return {
    count:            mine.length,
    pendingCount:     pending.length,
    approvedCount:    approved.length,
    paidCount:        paid.length,
    rejectedCount:    rejected.length,
    pendingTotal:     round2(sum(pending)),
    approvedTotal:    round2(sum(approved)),   // approved but not yet paid
    paidTotal:        round2(sum(paid)),
    rejectedTotal:    round2(sum(rejected)),
    earnedTotal:      round2(sum(earned)),     // approved + paid
    lifetimeTotal:    round2(sum(notRejected)),// pending + approved + paid
    approvalRatePct:  approvalRate,
    bestDay:          bestDay(notRejected),
    bestHour:         bestRollingHour(notRejected),
    thisWeekTotal:    round2(sum(inRange(notRejected, weekStart))),
    thisWeekCount:    inRange(notRejected, weekStart).length,
    thisMonthTotal:   round2(sum(inRange(notRejected, monthStart))),
    thisMonthCount:   inRange(notRejected, monthStart).length,
    avgHoursToApprove: averageHours(earned.map((e) => {
      const a = statusAt(e, PAYOUT_STATUS.APPROVED); const p = statusAt(e, PAYOUT_STATUS.PENDING);
      return a !== null && p !== null ? a - p : null;
    })),
    avgHoursToPaid: averageHours(paid.map((e) => {
      const pd = statusAt(e, PAYOUT_STATUS.PAID); const a = statusAt(e, PAYOUT_STATUS.APPROVED);
      return pd !== null && a !== null ? pd - a : null;
    })),
    firstAt:          sortedByDate.length ? sortedByDate[0].createdAt : null,
    latestAt:         sortedByDate.length ? sortedByDate[sortedByDate.length - 1].createdAt : null,
    activeDays:       new Set(notRejected.map((e) => localDayKey(e.createdAt))).size,
  };
}

/**
 * rankContributors(ledger, { currentUserId, limit }) — plain ranked list by
 * earned (approved + paid) total, then by count. Other users are anonymised to
 * the last four characters of their id.
 */
export function rankContributors(ledger = [], { currentUserId, limit = 10 } = {}) {
  const byUser = {};
  for (const e of ledger) {
    if (!earnedStatuses.has(e.status)) continue;
    byUser[e.userId] = byUser[e.userId] || { userId: e.userId, total: 0, count: 0 };
    byUser[e.userId].total = round2(byUser[e.userId].total + e.amount);
    byUser[e.userId].count += 1;
  }
  return Object.values(byUser)
    .sort((a, b) => b.total - a.total || b.count - a.count)
    .slice(0, limit)
    .map((row, i) => ({
      ...row,
      rank:  i + 1,
      isYou: row.userId === currentUserId,
      label: row.userId === currentUserId ? 'You' : `Contributor ${String(row.userId).slice(-4)}`,
    }));
}

export const DAY_IN_MS = DAY_MS;

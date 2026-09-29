// places2go — PayoutHistoryScreen
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// "Your payouts": statistics computed from your ledger entries (pending /
// approved / paid / rejected totals, approval rate, best day, best rolling
// hour, this week / month, average time to approval and to payment), the
// full trail of every credit (pending → approved → paid, with dates, notes and
// Stripe transfer ids), and — when the admin has it switched on — a plain
// ranked list of top contributors by paid-out credits.
//
// Every number here comes from the ledger on this device. In production the
// ledger is synced from your server so the list covers all contributors.

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius } from '../theme';
import useStore, { PAYOUT_STATUS, PAYOUT_KIND_LABELS } from '../store/useStore';
import { ROUTES } from '../navigation/routes';
import { computePayoutStats, rankContributors } from '../utils/payoutStats';
import { RISK_FLAG_LABELS } from '../services/presence';

const STATUS_STYLE = {
  [PAYOUT_STATUS.PENDING]:  { bg: colors.modPendingBg,  text: colors.modPendingText,  label: 'Pending review',  icon: 'time-outline' },
  [PAYOUT_STATUS.APPROVED]: { bg: colors.modApprovedBg, text: colors.modApprovedText, label: 'Approved',        icon: 'checkmark-circle-outline' },
  [PAYOUT_STATUS.PAID]:     { bg: colors.modCleanBg,    text: colors.modCleanText,    label: 'Paid',            icon: 'cash-outline' },
  [PAYOUT_STATUS.REJECTED]: { bg: colors.modRejectedBg, text: colors.modRejectedText, label: 'Not approved',    icon: 'close-circle-outline' },
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const fmtDay = (key) => {
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const money = (n) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

function Stat({ label, value, sub = null }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export default function PayoutHistoryScreen({ navigation }) {
  const insets      = useSafeAreaInsets();
  const currentUser = useStore((s) => s.currentUser);
  const ledger      = useStore((s) => s.payoutLedger);
  const places      = useStore((s) => s.places);
  const appSettings = useStore((s) => s.appSettings);
  const [expanded, setExpanded] = useState({});

  const stats   = useMemo(() => computePayoutStats(ledger, currentUser.id), [ledger, currentUser.id]);
  const mine    = useMemo(() => ledger.filter((e) => e.userId === currentUser.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [ledger, currentUser.id]);
  const ranking = useMemo(() => (appSettings.showPayoutLeaderboard ? rankContributors(ledger, { currentUserId: currentUser.id, limit: 10 }) : []), [ledger, currentUser.id, appSettings.showPayoutLeaderboard]);
  const placeName = (id) => places.find((p) => p.id === id)?.name || 'a place';

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
      {/* Totals */}
      <Text style={styles.sectionTitle}>TOTALS</Text>
      <View style={styles.grid}>
        <Stat label="Pending approval" value={money(stats.pendingTotal)} sub={`${stats.pendingCount} credit${stats.pendingCount === 1 ? '' : 's'}`} />
        <Stat label="Approved, unpaid" value={money(stats.approvedTotal)} sub={`${stats.approvedCount} credit${stats.approvedCount === 1 ? '' : 's'}`} />
        <Stat label="Paid out" value={money(stats.paidTotal)} sub={`${stats.paidCount} credit${stats.paidCount === 1 ? '' : 's'}`} />
        <Stat label="Earned (approved + paid)" value={money(stats.earnedTotal)} />
        <Stat label="Not approved" value={money(stats.rejectedTotal)} sub={`${stats.rejectedCount} credit${stats.rejectedCount === 1 ? '' : 's'}`} />
        <Stat label="Approval rate" value={stats.approvalRatePct === null ? '—' : `${stats.approvalRatePct}%`} sub={stats.approvalRatePct === null ? 'No decisions yet' : null} />
      </View>

      <Text style={styles.sectionTitle}>RECORDS</Text>
      <View style={styles.grid}>
        <Stat label="Best day" value={stats.bestDay ? money(stats.bestDay.amount) : '—'} sub={stats.bestDay ? `${fmtDay(stats.bestDay.dayKey)} · ${stats.bestDay.count} credit${stats.bestDay.count === 1 ? '' : 's'}` : null} />
        <Stat label="Best hour" value={stats.bestHour ? money(stats.bestHour.amount) : '—'} sub={stats.bestHour ? `${stats.bestHour.count} credit${stats.bestHour.count === 1 ? '' : 's'} within 60 min · ${fmtDate(stats.bestHour.startAt)}` : null} />
        <Stat label="This week" value={money(stats.thisWeekTotal)} sub={`${stats.thisWeekCount} credit${stats.thisWeekCount === 1 ? '' : 's'}`} />
        <Stat label="This month" value={money(stats.thisMonthTotal)} sub={`${stats.thisMonthCount} credit${stats.thisMonthCount === 1 ? '' : 's'}`} />
        <Stat label="Avg. time to approval" value={stats.avgHoursToApprove === null ? '—' : `${stats.avgHoursToApprove} h`} />
        <Stat label="Avg. approval → paid" value={stats.avgHoursToPaid === null ? '—' : `${stats.avgHoursToPaid} h`} />
        <Stat label="Active days" value={String(stats.activeDays)} />
        <Stat label="First / latest" value={stats.firstAt ? fmtDay(stats.firstAt.slice(0, 10)) : '—'} sub={stats.latestAt ? `latest ${fmtDate(stats.latestAt)}` : null} />
      </View>

      {/* Trail */}
      <Text style={styles.sectionTitle}>PAYOUT TRAIL</Text>
      {mine.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="wallet-outline" size={28} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No credits yet. Add a place with a qualifying review, or report an address with no public restroom, to earn ${appSettings.payoutAmountUSD.toFixed(2)}.</Text>
        </View>
      ) : (
        mine.map((entry) => {
          const st = STATUS_STYLE[entry.status] || STATUS_STYLE[PAYOUT_STATUS.PENDING];
          const open = !!expanded[entry.id];
          return (
            <View key={entry.id} style={styles.card}>
              <Pressable onPress={() => setExpanded((e) => ({ ...e, [entry.id]: !open }))} accessibilityRole="button" style={styles.cardHead}>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{placeName(entry.placeId)}</Text>
                  <Text style={styles.cardMeta}>{PAYOUT_KIND_LABELS[entry.kind] || 'Contribution'} · {fmtDate(entry.createdAt)}</Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.amount}>{money(entry.amount)}</Text>
                  <View style={[styles.pill, { backgroundColor: st.bg }]}><Text style={[styles.pillText, { color: st.text }]}>{st.label}</Text></View>
                </View>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
              </Pressable>

              {open ? (
                <View style={styles.trail}>
                  {(entry.history || []).map((step, i) => {
                    const s = STATUS_STYLE[step.status] || STATUS_STYLE[PAYOUT_STATUS.PENDING];
                    return (
                      <View key={i} style={styles.trailStep}>
                        <View style={styles.trailLine}>
                          <View style={[styles.trailDot, { backgroundColor: s.text }]} />
                          {i < entry.history.length - 1 ? <View style={styles.trailConnector} /> : null}
                        </View>
                        <View style={styles.trailText}>
                          <Text style={styles.trailStatus}>{s.label}</Text>
                          <Text style={styles.trailWhen}>{fmtDate(step.at)}</Text>
                          {step.note ? <Text style={styles.trailNote}>{step.note}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                  {entry.status === PAYOUT_STATUS.PAID ? (
                    <Text style={styles.trailNote}>
                      Paid via {entry.paidVia === 'stripe_connect' ? 'Stripe' : entry.paidVia === 'cash_app' ? 'Cash App' : entry.paidVia === 'zelle' ? 'Zelle' : 'manual transfer'}
                      {entry.transferId ? ` · ref ${entry.transferId}` : ''}
                    </Text>
                  ) : null}
                  {entry.riskFlags?.length ? (
                    <Text style={styles.trailNote}>Noted at submission: {entry.riskFlags.map((f) => RISK_FLAG_LABELS[f] || f).join('; ')}</Text>
                  ) : null}
                  <Pressable onPress={() => navigation.navigate(ROUTES.PLACE_DETAILS, { placeId: entry.placeId })} style={styles.openPlace} accessibilityRole="link">
                    <Text style={styles.openPlaceText}>Open place</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })
      )}

      {/* Plain ranked list */}
      {appSettings.showPayoutLeaderboard ? (
        <>
          <Text style={styles.sectionTitle}>TOP CONTRIBUTORS BY PAID-OUT CREDITS</Text>
          {ranking.length === 0 ? (
            <Text style={styles.caption}>No approved or paid credits recorded yet.</Text>
          ) : (
            <View style={styles.rankCard}>
              {ranking.map((row, i) => (
                <View key={row.userId} style={[styles.rankRow, i === ranking.length - 1 && styles.rankRowLast, row.isYou && styles.rankRowYou]}>
                  <Text style={styles.rankIndex}>{row.rank}</Text>
                  <Text style={[styles.rankLabel, row.isYou && styles.rankLabelYou]}>{row.label}</Text>
                  <Text style={styles.rankCount}>{row.count} credit{row.count === 1 ? '' : 's'}</Text>
                  <Text style={styles.rankTotal}>{money(row.total)}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.caption}>Other contributors are shown anonymously. Only approved and paid credits count.</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  sectionTitle: { ...typography.adminSectionHeader, marginTop: spacing.lg, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.sm },
  stat: { width: '50%', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  statValue: { ...typography.subheading },
  statLabel: { ...typography.label, marginTop: 2 },
  statSub: { ...typography.label, color: colors.textPrimary, marginTop: 2 },
  empty: { alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xl },
  emptyText: { ...typography.caption, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: spacing.sm, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  cardText: { flex: 1 },
  cardTitle: { ...typography.bodyMedium },
  cardMeta: { ...typography.label, marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: spacing.xs },
  amount: { ...typography.bodyMedium },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: { ...typography.badge },
  trail: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: spacing.md, gap: spacing.xs },
  trailStep: { flexDirection: 'row', gap: spacing.md },
  trailLine: { width: 12, alignItems: 'center' },
  trailDot: { width: 10, height: 10, borderRadius: radius.pill, marginTop: 4 },
  trailConnector: { flex: 1, width: 2, backgroundColor: colors.divider, marginTop: 2, minHeight: 14 },
  trailText: { flex: 1, paddingBottom: spacing.sm },
  trailStatus: { ...typography.captionMedium, color: colors.textPrimary },
  trailWhen: { ...typography.label },
  trailNote: { ...typography.caption, marginTop: 2 },
  openPlace: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  openPlaceText: { ...typography.captionMedium, color: colors.primary },
  rankCard: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  rankRowLast: { borderBottomWidth: 0 },
  rankRowYou: { backgroundColor: 'rgba(212, 175, 55, 0.08)', marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg },
  rankIndex: { ...typography.captionMedium, width: 22, color: colors.textSecondary },
  rankLabel: { ...typography.body, flex: 1 },
  rankLabelYou: { fontFamily: typography.bodyMedium.fontFamily },
  rankCount: { ...typography.label },
  rankTotal: { ...typography.bodyMedium, minWidth: 64, textAlign: 'right' },
  caption: { ...typography.caption, marginTop: spacing.sm },
});

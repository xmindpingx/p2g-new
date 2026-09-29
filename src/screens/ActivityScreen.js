// places2go — ActivityScreen (Activity tab)
// Two segments: Notifications (activityFeed) and Credits (payout ledger with
// per-entry status). Everything here is a plain readout of store state.

import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius } from '../theme';
import useStore, { PAYOUT_STATUS } from '../store/useStore';
import { ROUTES } from '../navigation/routes';

const SEGMENTS = [
  { key: 'feed',    label: 'Notifications' },
  { key: 'credits', label: 'Credits' },
];

const PAYOUT_STYLE = {
  [PAYOUT_STATUS.PENDING]:  { bg: colors.modPendingBg,  text: colors.modPendingText,  label: 'Pending review' },
  [PAYOUT_STATUS.APPROVED]: { bg: colors.modApprovedBg, text: colors.modApprovedText, label: 'Approved' },
  [PAYOUT_STATUS.PAID]:     { bg: colors.modCleanBg,    text: colors.modCleanText,    label: 'Paid' },
  [PAYOUT_STATUS.REJECTED]: { bg: colors.modRejectedBg, text: colors.modRejectedText, label: 'Not approved' },
};

const ICON_FOR_TYPE = {
  payout_pending:           'time-outline',
  payout_approved:          'checkmark-circle-outline',
  payout_paid:              'cash-outline',
  custom_amenity_approved:  'add-circle-outline',
  custom_amenity_rejected:  'close-circle-outline',
};

const formatWhen = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function ActivityScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const currentUser        = useStore((s) => s.currentUser);
  const activityFeed       = useStore((s) => s.activityFeed);
  const payoutLedger       = useStore((s) => s.payoutLedger);
  const places             = useStore((s) => s.places);
  const markActivityRead   = useStore((s) => s.markActivityRead);
  const markAllActivityRead = useStore((s) => s.markAllActivityRead);
  const getPayoutTotals    = useStore((s) => s.getPayoutTotals);

  const [segment, setSegment] = useState('feed');

  const feed = useMemo(
    () => activityFeed.filter((a) => !a.targetUserId || a.targetUserId === currentUser.id),
    [activityFeed, currentUser.id],
  );
  const ledger = useMemo(() => payoutLedger.filter((e) => e.userId === currentUser.id), [payoutLedger, currentUser.id]);
  const totals = getPayoutTotals();
  const unread = feed.filter((a) => !a.read).length;
  const placeName = (id) => places.find((p) => p.id === id)?.name || 'a place';

  const renderFeedItem = ({ item }) => (
    <Pressable
      onPress={() => {
        markActivityRead(item.id);
        if (item.placeId) navigation.navigate(ROUTES.PLACE_DETAILS, { placeId: item.placeId });
      }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, !item.read && styles.cardUnread, pressed && styles.pressed]}
    >
      <Ionicons name={ICON_FOR_TYPE[item.type] || 'notifications-outline'} size={20} color={colors.textPrimary} />
      <View style={styles.cardText}>
        <Text style={styles.cardMessage}>{item.message}</Text>
        <Text style={styles.cardWhen}>{formatWhen(item.createdAt)}</Text>
      </View>
      {!item.read ? <View style={styles.dot} /> : null}
    </Pressable>
  );

  const renderLedgerItem = ({ item }) => {
    const s = PAYOUT_STYLE[item.status] || PAYOUT_STYLE[PAYOUT_STATUS.PENDING];
    return (
      <Pressable
        onPress={() => navigation.navigate(ROUTES.PLACE_DETAILS, { placeId: item.placeId })}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.cardText}>
          <Text style={styles.cardMessage}>{placeName(item.placeId)}</Text>
          <Text style={styles.cardWhen}>{formatWhen(item.createdAt)}</Text>
        </View>
        <View style={styles.amountWrap}>
          <Text style={styles.amount}>${item.amount.toFixed(2)}</Text>
          <View style={[styles.status, { backgroundColor: s.bg }]}>
            <Text style={[styles.statusText, { color: s.text }]}>{s.label}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        {segment === 'feed' && unread > 0 ? (
          <Pressable onPress={markAllActivityRead} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.segments}>
        {SEGMENTS.map((s) => (
          <Pressable key={s.key} onPress={() => setSegment(s.key)} accessibilityRole="button" accessibilityState={{ selected: segment === s.key }}
            style={[styles.segment, segment === s.key && styles.segmentActive]}>
            <Text style={[styles.segmentText, segment === s.key && styles.segmentTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {segment === 'credits' ? (
        <View style={styles.totals}>
          <View style={styles.total}><Text style={styles.totalValue}>${totals.pending.toFixed(2)}</Text><Text style={styles.totalLabel}>Pending</Text></View>
          <View style={styles.total}><Text style={styles.totalValue}>${totals.approved.toFixed(2)}</Text><Text style={styles.totalLabel}>Approved</Text></View>
          <View style={styles.total}><Text style={styles.totalValue}>${totals.paid.toFixed(2)}</Text><Text style={styles.totalLabel}>Paid</Text></View>
        </View>
      ) : null}

      <FlatList
        data={segment === 'feed' ? feed : ledger}
        keyExtractor={(i) => i.id}
        renderItem={segment === 'feed' ? renderFeedItem : renderLedgerItem}
        contentContainerStyle={[styles.list, (segment === 'feed' ? feed : ledger).length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={segment === 'feed' ? 'notifications-outline' : 'wallet-outline'} size={32} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>{segment === 'feed' ? 'Nothing yet' : 'No credits yet'}</Text>
            <Text style={styles.emptyCaption}>
              {segment === 'feed'
                ? 'Updates about your contributions will show up here.'
                : `Add a place and write a qualifying review to earn $${totals.payoutAmountUSD.toFixed(2)}.`}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { ...typography.heading },
  link: { ...typography.captionMedium, color: colors.primary },
  segments: { flexDirection: 'row', marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, marginBottom: spacing.md },
  segment: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { ...typography.captionMedium, color: colors.textPrimary },
  segmentTextActive: { color: colors.textOnDark },
  totals: { flexDirection: 'row', marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.md, marginBottom: spacing.md },
  total: { flex: 1, alignItems: 'center' },
  totalValue: { ...typography.subheading },
  totalLabel: { ...typography.label },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  listEmpty: { flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: colors.accent },
  pressed: { opacity: 0.85 },
  cardText: { flex: 1 },
  cardMessage: { ...typography.body },
  cardWhen: { ...typography.label, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  amountWrap: { alignItems: 'flex-end', gap: spacing.xs },
  amount: { ...typography.bodyMedium },
  status: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusText: { ...typography.badge },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.subheading },
  emptyCaption: { ...typography.caption, textAlign: 'center' },
});

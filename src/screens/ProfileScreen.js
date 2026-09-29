// places2go — ProfileScreen (wireframe #9)
// Avatar, name, three stat tiles (Contributions · Reviews · Credits earned),
// then rows: My Reviews, Saved Places, For Business, The Bigger Picture,
// Settings. Mods and admins also see an Admin Panel row.

import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius } from '../theme';
import useStore, { USER_ROLES, PAYOUT_STATUS } from '../store/useStore';
import { ROUTES } from '../navigation/routes';

function Row({ icon, label, caption = null, onPress, badge = null }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Ionicons name={icon} size={20} color={colors.textPrimary} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {caption ? <Text style={styles.rowCaption}>{caption}</Text> : null}
      </View>
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

export default function ProfileScreen({ navigation }) {
  const insets       = useSafeAreaInsets();
  const currentUser  = useStore((s) => s.currentUser);
  const places       = useStore((s) => s.places);
  const reviews      = useStore((s) => s.reviews);
  const savedCount   = useStore((s) => s.savedPlaceIds.length);
  const payoutLedger = useStore((s) => s.payoutLedger);
  const pendingMod   = useStore((s) => s.moderationQueue.filter((e) => e.aiStatus === 'flagged' && e.manualStatus === 'awaiting').length);
  const pendingSubs  = useStore((s) => s.customAmenitySubmissions.filter((c) => c.status === 'pending').length);
  const resetToSeed  = useStore((s) => s.resetToSeed);

  const isModOrAdmin = currentUser.role === USER_ROLES.MOD || currentUser.role === USER_ROLES.ADMIN;

  const stats = useMemo(() => {
    const contributions = places.filter((p) => p.contributorId === currentUser.id).length;
    const myReviews     = reviews.filter((r) => r.userId === currentUser.id).length;
    const earned        = payoutLedger
      .filter((e) => e.userId === currentUser.id && (e.status === PAYOUT_STATUS.APPROVED || e.status === PAYOUT_STATUS.PAID))
      .reduce((t, e) => t + e.amount, 0);
    const pending = payoutLedger
      .filter((e) => e.userId === currentUser.id && e.status === PAYOUT_STATUS.PENDING)
      .reduce((t, e) => t + e.amount, 0);
    return { contributions, myReviews, earned, pending };
  }, [places, reviews, payoutLedger, currentUser.id]);

  const confirmReset = () =>
    Alert.alert('Reset local data?', 'This clears everything stored on this device and restores the sample data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetToSeed },
    ]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl }}>
      <Text style={styles.title}>My Profile</Text>

      <View style={styles.identity}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{currentUser.initials}</Text></View>
        <Text style={styles.name}>{currentUser.displayName}</Text>
        <Text style={styles.role}>
          {currentUser.role === USER_ROLES.ADMIN ? 'Administrator' : currentUser.role === USER_ROLES.MOD ? 'Moderator' : 'Community Contributor'}
        </Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statValue}>{stats.contributions}</Text><Text style={styles.statLabel}>Contributions</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{stats.myReviews}</Text><Text style={styles.statLabel}>Reviews</Text></View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>${stats.earned.toFixed(2)}</Text>
          <Text style={styles.statLabel}>Credits earned</Text>
          {stats.pending > 0 ? <Text style={styles.statSub}>+${stats.pending.toFixed(2)} pending</Text> : null}
        </View>
      </View>

      <View style={styles.group}>
        <Row icon="star-outline"     label="My Reviews"    caption={`${stats.myReviews} written`} onPress={() => navigation.navigate(ROUTES.TAB_ACTIVITY)} />
        <Row icon="bookmark-outline" label="Saved Places"  caption={`${savedCount} saved`}         onPress={() => navigation.navigate(ROUTES.TAB_SAVED)} />
        <Row icon="wallet-outline"   label="Contribution credits" caption="Ledger and payout status" onPress={() => navigation.navigate(ROUTES.TAB_ACTIVITY)} />
      </View>

      <View style={styles.group}>
        <Row icon="business-outline" label="For Business"       onPress={() => navigation.navigate(ROUTES.FOR_BUSINESS)} />
        <Row icon="earth-outline"    label="The Bigger Picture" onPress={() => navigation.navigate(ROUTES.BIGGER_PICTURE)} />
      </View>

      {isModOrAdmin ? (
        <View style={styles.group}>
          <Row
            icon="shield-checkmark-outline"
            label="Admin Panel"
            caption="Moderation, settings, amenities"
            badge={pendingMod + pendingSubs > 0 ? String(pendingMod + pendingSubs) : null}
            onPress={() => navigation.navigate(ROUTES.ADMIN_PANEL)}
          />
        </View>
      ) : null}

      <View style={styles.group}>
        <Row icon="refresh-outline" label="Reset local data" caption="Restore sample places" onPress={confirmReset} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.heading, paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  identity: { alignItems: 'center', marginBottom: spacing.xl },
  avatar: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  avatarText: { ...typography.title },
  name: { ...typography.subheading },
  role: { ...typography.caption, marginTop: 2 },
  stats: { flexDirection: 'row', marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.lg, marginBottom: spacing.lg },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.heading },
  statLabel: { ...typography.label, marginTop: 2 },
  statSub: { ...typography.label, color: colors.modUnderReviewText, marginTop: 2 },
  group: { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: spacing.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  rowPressed: { backgroundColor: colors.background },
  rowText: { flex: 1 },
  rowLabel: { ...typography.body },
  rowCaption: { ...typography.label },
  badge: { minWidth: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs + 2 },
  badgeText: { ...typography.badge, color: colors.textOnAccent },
});

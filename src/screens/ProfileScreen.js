// places2go — ProfileScreen (wireframe #9)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Avatar, name, stat tiles (Contributions · Reviews · Credits earned), then:
//   Account        — signed in with Apple / Google / guest, sign in or out
//   Payouts        — your payouts (trail + statistics), payout method
//   Places         — reviews, saved places
//   Community      — share my location (live map), support places2go (donate)
//   Business       — For Business, The Bigger Picture
//   Admin Panel    — mods and admins only
//   Legal & data   — Terms & Privacy, reset local data, ownership notice

import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { showAlert } from '../utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius } from '../theme';
import useStore, { USER_ROLES, PAYOUT_STATUS, AUTH_PROVIDERS, AUTH_PROVIDER_LABELS, PAYOUT_METHODS, PAYOUT_METHOD_LABELS } from '../store/useStore';
import { ROUTES } from '../navigation/routes';
import { isLiveMapConfigured } from '../services/liveMap';
import OwnershipFooter from '../components/OwnershipFooter';

function Row({ icon, label, caption = null, onPress, badge = null, right = null }) {
  const content = (
    <>
      <Ionicons name={icon} size={20} color={colors.textPrimary} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {caption ? <Text style={styles.rowCaption}>{caption}</Text> : null}
      </View>
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
      {right ? right : onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {content}
    </Pressable>
  );
}

export default function ProfileScreen({ navigation }) {
  const insets       = useSafeAreaInsets();
  const currentUser  = useStore((s) => s.currentUser);
  const appSettings  = useStore((s) => s.appSettings);
  const places       = useStore((s) => s.places);
  const reviews      = useStore((s) => s.reviews);
  const savedCount   = useStore((s) => s.savedPlaceIds.length);
  const payoutLedger = useStore((s) => s.payoutLedger);
  const pendingMod   = useStore((s) => s.moderationQueue.filter((e) => e.aiStatus === 'flagged' && e.manualStatus === 'awaiting').length);
  const pendingSubs  = useStore((s) => s.customAmenitySubmissions.filter((c) => c.status === 'pending').length);
  const pendingReports = useStore((s) => s.places.filter((p) => p.hasPublicRestroom === false && p.reportVerification === 'awaiting').length);
  const pendingPayouts = useStore((s) => s.payoutLedger.filter((e) => e.status === PAYOUT_STATUS.PENDING).length);
  const resetToSeed  = useStore((s) => s.resetToSeed);
  const signOut      = useStore((s) => s.signOut);
  const setShareLocation = useStore((s) => s.setShareLocation);

  const isAdmin      = currentUser.role === USER_ROLES.ADMIN;
  const isModOrAdmin = currentUser.role === USER_ROLES.MOD || isAdmin;
  const auth         = currentUser.auth;

  const stats = useMemo(() => {
    const contributions = places.filter((p) => p.contributorId === currentUser.id).length;
    const myReviews     = reviews.filter((r) => r.userId === currentUser.id).length;
    const mine          = payoutLedger.filter((e) => e.userId === currentUser.id);
    const earned  = mine.filter((e) => e.status === PAYOUT_STATUS.APPROVED || e.status === PAYOUT_STATUS.PAID).reduce((t, e) => t + e.amount, 0);
    const pending = mine.filter((e) => e.status === PAYOUT_STATUS.PENDING).reduce((t, e) => t + e.amount, 0);
    return { contributions, myReviews, earned, pending, payoutCount: mine.length };
  }, [places, reviews, payoutLedger, currentUser.id]);

  const accountCaption = !auth
    ? 'Not signed in — sign in to keep your credits tied to an account'
    : auth.provider === AUTH_PROVIDERS.GUEST
      ? 'Guest — sign in with Apple or Google to register'
      : `Signed in with ${AUTH_PROVIDER_LABELS[auth.provider] || auth.provider}${auth.email ? ` · ${auth.email}` : ''}`;

  const payoutMethodCaption = currentUser.payoutMethod
    ? currentUser.payoutMethod.type === PAYOUT_METHODS.CASH_APP
      ? `Cash App · ${currentUser.payoutMethod.cashtag}`
      : currentUser.payoutMethod.type === PAYOUT_METHODS.ZELLE
        ? `Zelle · ${currentUser.payoutMethod.zelleContact}`
        : `Stripe · ${currentUser.stripeConnect?.payoutsEnabled ? 'ready for payouts' : 'setup incomplete'}`
    : 'Not set — choose how to receive your credits';

  const confirmSignOut = () =>
    showAlert('Sign out?', 'Your places, reviews and credits stay on this device. You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);

  const confirmReset = () =>
    showAlert('Reset local data?', 'This clears everything stored on this device and restores the sample data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetToSeed },
    ]);

  const liveMapAvailable = isLiveMapConfigured(appSettings);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl }}>
      <Text style={styles.title}>My Profile</Text>

      <View style={styles.identity}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{currentUser.initials}</Text></View>
        <Text style={styles.name}>{currentUser.displayName}</Text>
        <Text style={styles.role}>
          {isAdmin ? 'Administrator' : currentUser.role === USER_ROLES.MOD ? 'Moderator' : 'Community Contributor'}
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

      <Text style={styles.groupTitle}>ACCOUNT</Text>
      <View style={styles.group}>
        <Row
          icon={auth && auth.provider !== AUTH_PROVIDERS.GUEST ? 'person-circle-outline' : 'log-in-outline'}
          label={auth && auth.provider !== AUTH_PROVIDERS.GUEST ? 'Your account' : 'Sign in or register'}
          caption={accountCaption}
          onPress={() => navigation.navigate(ROUTES.AUTH, { fromProfile: true })}
        />
        {auth ? <Row icon="log-out-outline" label="Sign out" onPress={confirmSignOut} /> : null}
      </View>

      <Text style={styles.groupTitle}>PAYOUTS</Text>
      <View style={styles.group}>
        <Row
          icon="wallet-outline"
          label="Your payouts"
          caption={stats.payoutCount ? `${stats.payoutCount} credit${stats.payoutCount === 1 ? '' : 's'} · statistics and history` : 'Statistics and history'}
          onPress={() => navigation.navigate(ROUTES.PAYOUT_HISTORY)}
        />
        <Row icon="card-outline" label="Payout method" caption={payoutMethodCaption} onPress={() => navigation.navigate(ROUTES.PAYOUT_METHOD)} />
      </View>

      <Text style={styles.groupTitle}>PLACES</Text>
      <View style={styles.group}>
        <Row icon="star-outline"     label="My Reviews"   caption={`${stats.myReviews} written`} onPress={() => navigation.navigate(ROUTES.TAB_ACTIVITY)} />
        <Row icon="bookmark-outline" label="Saved Places" caption={`${savedCount} saved`}         onPress={() => navigation.navigate(ROUTES.TAB_SAVED)} />
      </View>

      <Text style={styles.groupTitle}>COMMUNITY</Text>
      <View style={styles.group}>
        <Row
          icon="radio-outline"
          label="Share my location on the map"
          caption={liveMapAvailable
            ? `Other users who share see you as an anonymous dot (rounded to about ${appSettings.liveMapCoarsenDecimals >= 3 ? '110 m' : '1 km'}). You see them too.`
            : 'Not available — live map is turned off'}
          right={
            <Switch
              value={currentUser.shareLocation === true}
              onValueChange={setShareLocation}
              disabled={!liveMapAvailable}
              trackColor={{ true: colors.success, false: colors.border }}
              thumbColor={colors.surface}
            />
          }
        />
        {appSettings.donationsEnabled ? (
          <Row icon="heart-outline" label="Support places2go" caption="Donate to keep the map running" onPress={() => navigation.navigate(ROUTES.DONATE)} />
        ) : null}
      </View>

      <Text style={styles.groupTitle}>BUSINESS</Text>
      <View style={styles.group}>
        <Row icon="business-outline" label="For Business"       onPress={() => navigation.navigate(ROUTES.FOR_BUSINESS)} />
        <Row icon="earth-outline"    label="The Bigger Picture" onPress={() => navigation.navigate(ROUTES.BIGGER_PICTURE)} />
      </View>

      {isModOrAdmin ? (
        <>
          <Text style={styles.groupTitle}>ADMINISTRATION</Text>
          <View style={styles.group}>
            <Row
              icon="shield-checkmark-outline"
              label="Admin Panel"
              caption={isAdmin ? 'Moderation, verification, payouts, co-branding, settings' : 'Moderation, amenities'}
              badge={(pendingMod + pendingSubs + (isAdmin ? pendingReports + pendingPayouts : 0)) > 0 ? String(pendingMod + pendingSubs + (isAdmin ? pendingReports + pendingPayouts : 0)) : null}
              onPress={() => navigation.navigate(ROUTES.ADMIN_PANEL)}
            />
          </View>
        </>
      ) : null}

      <Text style={styles.groupTitle}>LEGAL & DATA</Text>
      <View style={styles.group}>
        <Row icon="document-text-outline" label="Terms & Privacy" caption="Terms of Service, Privacy Policy, Contributor Terms" onPress={() => navigation.navigate(ROUTES.LEGAL, { readOnly: true })} />
        <Row icon="refresh-outline" label="Reset local data" caption="Restore sample places" onPress={confirmReset} />
      </View>

      <OwnershipFooter />
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
  groupTitle: { ...typography.adminSectionHeader, marginHorizontal: spacing.lg, marginBottom: spacing.xs, marginTop: spacing.xs },
  group: { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: spacing.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  rowPressed: { backgroundColor: colors.background },
  rowText: { flex: 1 },
  rowLabel: { ...typography.body },
  rowCaption: { ...typography.label, marginTop: 2 },
  badge: { minWidth: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs + 2 },
  badgeText: { ...typography.badge, color: colors.textOnAccent },
});

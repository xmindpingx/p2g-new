// places2go — AdminPanelScreen
// Hub for mods and admins: pending counts and links to the queue, settings,
// amenity manager, and the contributor payout ledger (admin only).

import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius } from '../theme';
import useStore, { USER_ROLES, PAYOUT_STATUS } from '../store/useStore';
import { ROUTES } from '../navigation/routes';
import { AI_STATUS, MANUAL_STATUS } from '../constants/moderation';
import { CUSTOM_AMENITY_STATUS } from '../constants/amenities';

function Tile({ icon, label, value, onPress, accent = false }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.tileHead}>
        <Ionicons name={icon} size={20} color={colors.textPrimary} />
        {value !== null && value !== undefined ? (
          <View style={[styles.count, accent && value > 0 && styles.countAccent]}>
            <Text style={[styles.countText, accent && value > 0 && styles.countTextAccent]}>{value}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

export default function AdminPanelScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const currentUser  = useStore((s) => s.currentUser);
  const queue        = useStore((s) => s.moderationQueue);
  const submissions  = useStore((s) => s.customAmenitySubmissions);
  const ledger       = useStore((s) => s.payoutLedger);
  const appSettings  = useStore((s) => s.appSettings);
  const amenityCount = useStore((s) => s.officialAmenities.filter((a) => a.isActive).length);

  const isAdmin = currentUser.role === USER_ROLES.ADMIN;

  const counts = useMemo(() => ({
    flagged:   queue.filter((e) => e.aiStatus === AI_STATUS.FLAGGED && e.manualStatus === MANUAL_STATUS.AWAITING).length,
    errored:   queue.filter((e) => e.aiStatus === AI_STATUS.ERROR   && e.manualStatus === MANUAL_STATUS.AWAITING).length,
    pendingAi: queue.filter((e) => e.aiStatus === AI_STATUS.PENDING).length,
    suggested: submissions.filter((s) => s.status === CUSTOM_AMENITY_STATUS.PENDING).length,
    payouts:   ledger.filter((e) => e.status === PAYOUT_STATUS.PENDING).length,
  }), [queue, submissions, ledger]);

  const ollamaState = !appSettings.ollamaBaseUrl
    ? { label: 'Not configured', bg: colors.connUnverifiedBg, text: colors.connUnverifiedText, dot: colors.connUnverifiedDot }
    : appSettings.ollamaConnectionVerified
      ? { label: 'Connected', bg: colors.connVerifiedBg, text: colors.connVerifiedText, dot: colors.connVerifiedDot }
      : { label: 'Unverified', bg: colors.connErrorBg, text: colors.connErrorText, dot: colors.connErrorDot };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
      <Text style={styles.sectionHeader}>NEEDS ATTENTION</Text>
      <View style={styles.grid}>
        <Tile icon="flag-outline"        label="Flagged content"   value={counts.flagged + counts.errored} accent onPress={() => navigation.navigate(ROUTES.MOD_QUEUE)} />
        <Tile icon="bulb-outline"        label="Suggested amenities" value={counts.suggested} accent onPress={() => navigation.navigate(ROUTES.ADMIN_AMENITIES, { tab: 'suggestions' })} />
      </View>

      <Text style={styles.sectionHeader}>MANAGE</Text>
      <View style={styles.grid}>
        <Tile icon="list-outline"     label="Amenity registry" value={amenityCount} onPress={() => navigation.navigate(ROUTES.ADMIN_AMENITIES)} />
        <Tile icon="options-outline"  label="App settings"     value={null}         onPress={() => navigation.navigate(ROUTES.ADMIN_SETTINGS)} />
      </View>

      <Text style={styles.sectionHeader}>STATUS</Text>
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Ollama moderation</Text>
          <View style={[styles.pill, { backgroundColor: ollamaState.bg }]}>
            <View style={[styles.pillDot, { backgroundColor: ollamaState.dot }]} />
            <Text style={[styles.pillText, { color: ollamaState.text }]}>{ollamaState.label}</Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Awaiting AI result</Text>
          <Text style={styles.statusValue}>{counts.pendingAi}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Payouts pending approval</Text>
          <Text style={styles.statusValue}>{counts.payouts}</Text>
        </View>
        <View style={[styles.statusRow, styles.statusRowLast]}>
          <Text style={styles.statusLabel}>Your role</Text>
          <Text style={styles.statusValue}>{isAdmin ? 'Administrator' : 'Moderator'}</Text>
        </View>
      </View>

      {!isAdmin ? (
        <Text style={styles.note}>
          Moderators can review content and manage amenities. Payout amounts, moderation thresholds, and Ollama settings require an administrator.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.adminSurface },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  sectionHeader: { ...typography.adminSectionHeader, marginBottom: spacing.sm, marginTop: spacing.md },
  grid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.adminBorder },
  pressed: { opacity: 0.85 },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  count: { minWidth: 26, height: 26, borderRadius: radius.pill, backgroundColor: colors.modPendingBg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  countAccent: { backgroundColor: colors.accent },
  countText: { ...typography.badge, color: colors.modPendingText },
  countTextAccent: { color: colors.textOnAccent },
  tileLabel: { ...typography.bodyMedium },
  statusCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.adminBorder, paddingHorizontal: spacing.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  statusRowLast: { borderBottomWidth: 0 },
  statusLabel: { ...typography.body },
  statusValue: { ...typography.adminValue },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pillDot: { width: 8, height: 8, borderRadius: radius.pill },
  pillText: { ...typography.badge },
  note: { ...typography.caption, marginTop: spacing.lg },
});

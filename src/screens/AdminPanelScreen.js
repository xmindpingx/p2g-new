// places2go — AdminPanelScreen
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Hub for mods and admins: pending counts and links to the moderation queue,
// amenity manager and settings; admins also get Verification & Payouts and
// Co-branding.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius } from '../theme';
import useStore, { USER_ROLES, PAYOUT_STATUS, REPORT_VERIFICATION } from '../store/useStore';
import { ROUTES } from '../navigation/routes';
import { AI_STATUS, MANUAL_STATUS } from '../constants/moderation';
import { CUSTOM_AMENITY_STATUS } from '../constants/amenities';
import { PARTNERSHIP_STATUS } from '../constants/cobranding';
import { runAiModeration, isRunning as isAiRunning } from '../services/aiModeration';
import { runAutoApproval, isRunning as isAutoRunning } from '../services/autoApproval';

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
  const amenityCount   = useStore((s) => s.officialAmenities.filter((a) => a.isActive).length);
  const places         = useStore((s) => s.places);
  const coBranding     = useStore((s) => s.coBranding);
  const bugReportCount = useStore((s) => s.bugReports.filter((r) => !r.dismissed).length);

  const isAdmin = currentUser.role === USER_ROLES.ADMIN;

  const counts = useMemo(() => ({
    flagged:   queue.filter((e) => e.aiStatus === AI_STATUS.FLAGGED && e.manualStatus === MANUAL_STATUS.AWAITING).length,
    errored:   queue.filter((e) => e.aiStatus === AI_STATUS.ERROR   && e.manualStatus === MANUAL_STATUS.AWAITING).length,
    pendingAi: queue.filter((e) => e.aiStatus === AI_STATUS.PENDING).length,
    suggested: submissions.filter((s) => s.status === CUSTOM_AMENITY_STATUS.PENDING).length,
    payouts:   ledger.filter((e) => e.status === PAYOUT_STATUS.PENDING).length,
    approvedUnpaid: ledger.filter((e) => e.status === PAYOUT_STATUS.APPROVED).length,
    reports:   places.filter((p) => p.hasPublicRestroom === false && p.reportVerification === REPORT_VERIFICATION.AWAITING).length,
    partners:  Object.values(coBranding).filter((c) => c.status === PARTNERSHIP_STATUS.ACTIVE).length,
    notContacted: places.filter((p) => !coBranding[p.id] || coBranding[p.id].status === PARTNERSHIP_STATUS.NOT_CONTACTED).length,
  }), [queue, submissions, ledger, places, coBranding]);

  // ── AI screening: runs the pending queue against the admin's Ollama server ──
  const [aiBusy, setAiBusy]         = useState(false);
  const [aiProgress, setAiProgress] = useState(null);
  const [aiResult, setAiResult]     = useState(null);
  const autoRanRef = useRef(false);

  const screeningPossible = !!appSettings.autoFlagNsfwContent && !!appSettings.ollamaBaseUrl && appSettings.ollamaConnectionVerified;

  const runScreening = useCallback(async () => {
    if (isAiRunning()) return;
    setAiBusy(true);
    setAiResult(null);
    try {
      const summary = await runAiModeration({ onProgress: (p) => setAiProgress(p) });
      const parts = [
        `${summary.processed} processed`,
        summary.clean   ? `${summary.clean} clean`     : null,
        summary.flagged ? `${summary.flagged} flagged` : null,
        summary.errors  ? `${summary.errors} error${summary.errors === 1 ? '' : 's'}` : null,
        summary.skipped ? `${summary.skipped} skipped (no model set)` : null,
      ].filter(Boolean);
      const firstProblem = summary.details.find((d) => d.status === 'error' || d.status === 'skipped');
      setAiResult({ ok: summary.errors === 0 && summary.skipped === 0, text: `${parts.join(' · ')}${firstProblem ? ` — ${firstProblem.message}` : ''}` });
    } catch (err) {
      setAiResult({ ok: false, text: err.message });
    } finally {
      setAiBusy(false);
      setAiProgress(null);
    }
  }, []);

  // ── Automatic approval / payment of pending credits (admin only) ──
  const [autoBusy, setAutoBusy]     = useState(false);
  const [autoResult, setAutoResult] = useState(null);
  const autoApproveRanRef = useRef(false);
  const autoPossible = isAdmin && !!appSettings.autoApproveEnabled;

  const runApprovals = useCallback(async () => {
    if (isAutoRunning()) return;
    setAutoBusy(true);
    setAutoResult(null);
    try {
      const r = await runAutoApproval();
      const parts = [
        `${r.evaluated} evaluated`,
        `${r.approved} approved`,
        r.paid      ? `${r.paid} paid via Stripe` : null,
        r.payFailed ? `${r.payFailed} payment${r.payFailed === 1 ? '' : 's'} failed` : null,
        r.held      ? `${r.held} held for you` : null,
      ].filter(Boolean);
      const firstIssue = r.details.find((d) => d.outcome === 'pay_failed' || d.outcome === 'pay_skipped');
      setAutoResult({ ok: r.payFailed === 0, text: `${parts.join(' · ')}${firstIssue ? ` — ${firstIssue.message}` : ''}` });
    } catch (err) {
      setAutoResult({ ok: false, text: err.message });
    } finally {
      setAutoBusy(false);
    }
  }, []);

  // Auto-run once when the panel opens with work waiting and Ollama verified,
  // then evaluate pending credits (their AI checks depend on the screening).
  useEffect(() => {
    if (autoRanRef.current) return;
    if (screeningPossible && counts.pendingAi > 0) {
      autoRanRef.current = true;
      runScreening().then(() => { if (autoPossible && counts.payouts > 0) { autoApproveRanRef.current = true; runApprovals(); } });
    }
  }, [screeningPossible, counts.pendingAi, counts.payouts, autoPossible, runScreening, runApprovals]);

  useEffect(() => {
    if (autoApproveRanRef.current || aiBusy) return;
    if (autoPossible && counts.payouts > 0 && counts.pendingAi === 0) { autoApproveRanRef.current = true; runApprovals(); }
  }, [autoPossible, counts.payouts, counts.pendingAi, aiBusy, runApprovals]);

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
      {isAdmin ? (
        <View style={styles.grid}>
          <Tile icon="shield-checkmark-outline" label="Reports to verify" value={counts.reports} accent onPress={() => navigation.navigate(ROUTES.ADMIN_VERIFICATION, { tab: 'reports' })} />
          <Tile icon="wallet-outline"           label="Payouts" value={counts.payouts + counts.approvedUnpaid} accent onPress={() => navigation.navigate(ROUTES.ADMIN_VERIFICATION, { tab: 'payouts' })} />
        </View>
      ) : null}

      <Text style={styles.sectionHeader}>MANAGE</Text>
      <View style={styles.grid}>
        <Tile icon="list-outline"     label="Amenity registry" value={amenityCount} onPress={() => navigation.navigate(ROUTES.ADMIN_AMENITIES)} />
        <Tile icon="options-outline"  label="App settings"     value={null}         onPress={() => navigation.navigate(ROUTES.ADMIN_SETTINGS)} />
      </View>
      <View style={styles.grid}>
        <Tile icon="bug-outline" label="Bug reports" value={bugReportCount} accent={bugReportCount > 0} onPress={() => navigation.navigate(ROUTES.ADMIN_BUG_REPORTS)} />
        <View style={styles.tileSpacer} />
      </View>
      {isAdmin ? (
        <View style={styles.grid}>
          <Tile icon="storefront-outline" label="Co-branding" value={counts.partners} onPress={() => navigation.navigate(ROUTES.COBRANDING)} />
          <View style={styles.tileSpacer} />
        </View>
      ) : null}

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
        <View style={[styles.statusRow, styles.screenRow]}>
          <View style={styles.screenText}>
            {aiBusy ? (
              <Text style={styles.screenHint}>
                {aiProgress ? `Screening ${aiProgress.index} of ${aiProgress.total}…` : 'Starting AI screening…'}
              </Text>
            ) : aiResult ? (
              <Text style={[styles.screenHint, !aiResult.ok && styles.screenHintError]}>{aiResult.text}</Text>
            ) : (
              <Text style={styles.screenHint}>
                {!appSettings.autoFlagNsfwContent
                  ? 'AI Content Screening is off in Admin Settings.'
                  : !appSettings.ollamaBaseUrl
                    ? 'Set the Ollama server URL in Admin Settings to screen content.'
                    : !appSettings.ollamaConnectionVerified
                      ? 'Test the Ollama connection in Admin Settings first.'
                      : counts.pendingAi === 0
                        ? 'Nothing waiting. New submissions are screened when this panel opens.'
                        : 'Pending items are screened by your Ollama server from this device.'}
              </Text>
            )}
          </View>
          <Pressable
            onPress={runScreening}
            disabled={aiBusy || !screeningPossible || counts.pendingAi === 0}
            accessibilityRole="button"
            accessibilityLabel="Run AI screening now"
            style={({ pressed }) => [styles.screenButton, (aiBusy || !screeningPossible || counts.pendingAi === 0) && styles.screenButtonDisabled, pressed && styles.pressed]}
          >
            {aiBusy ? <ActivityIndicator size="small" color={colors.textOnDark} /> : <Text style={styles.screenButtonText}>Screen now</Text>}
          </Pressable>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Payouts pending approval</Text>
          <Text style={styles.statusValue}>{counts.payouts}</Text>
        </View>
        {isAdmin ? (
          <View style={[styles.statusRow, styles.screenRow]}>
            <View style={styles.screenText}>
              {autoBusy ? (
                <Text style={styles.screenHint}>Evaluating pending credits…</Text>
              ) : autoResult ? (
                <Text style={[styles.screenHint, !autoResult.ok && styles.screenHintError]}>{autoResult.text}</Text>
              ) : (
                <Text style={styles.screenHint}>
                  {!appSettings.autoApproveEnabled
                    ? 'Automatic approval is off (Admin Settings → Automatic Approval & Payment).'
                    : counts.payouts === 0
                      ? 'No credits waiting. New credits are evaluated when this panel opens.'
                      : `Credits that pass every automation check are approved${appSettings.autoPayEnabled ? ' and paid via Stripe' : ''}; the rest wait for you.`}
                </Text>
              )}
            </View>
            <Pressable
              onPress={runApprovals}
              disabled={autoBusy || !autoPossible || counts.payouts === 0}
              accessibilityRole="button"
              accessibilityLabel="Run automatic approval now"
              style={({ pressed }) => [styles.screenButton, (autoBusy || !autoPossible || counts.payouts === 0) && styles.screenButtonDisabled, pressed && styles.pressed]}
            >
              {autoBusy ? <ActivityIndicator size="small" color={colors.textOnDark} /> : <Text style={styles.screenButtonText}>Auto-approve</Text>}
            </Pressable>
          </View>
        ) : null}
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Approved, awaiting payment</Text>
          <Text style={styles.statusValue}>{counts.approvedUnpaid}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Businesses not yet contacted</Text>
          <Text style={styles.statusValue}>{counts.notContacted}</Text>
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
  tileSpacer: { flex: 1 },
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
  screenRow: { alignItems: 'flex-start', gap: spacing.md },
  screenText: { flex: 1 },
  screenHint: { ...typography.caption, color: colors.textSecondary },
  screenHintError: { color: colors.modRejectedText },
  screenButton: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 96, alignItems: 'center' },
  screenButtonDisabled: { opacity: 0.4 },
  screenButtonText: { ...typography.badge, color: colors.textOnDark },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pillDot: { width: 8, height: 8, borderRadius: radius.pill },
  pillText: { ...typography.badge },
  note: { ...typography.caption, marginTop: spacing.lg },
});

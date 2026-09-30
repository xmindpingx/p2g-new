// places2go — AdminBugReportsScreen
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Lists bug reports from the bug-report server (newest first) — reports filed
// from every user's device, not just this one. For each report the admin can
// run Ollama analysis to surface the likely cause, severity, and fix
// suggestions, or dismiss reports that have been resolved. Analysis and
// dismissal are saved back to the server so every admin device sees them.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Image,
  ActivityIndicator, RefreshControl, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../theme';
import useStore from '../store/useStore';
import {
  analyseBugReport, fetchBugReports, updateBugReport, bugReportScreenshotUrl,
} from '../services/bugReport';

// ── Severity badge colours ──────────────────────────────────────────────────
const SEVERITY_STYLE = {
  low:      { bg: colors.connVerifiedBg,   text: colors.connVerifiedText   },
  medium:   { bg: colors.modPendingBg,     text: colors.modPendingText     },
  high:     { bg: colors.modFlaggedBg,     text: colors.modFlaggedText     },
  critical: { bg: colors.modRejectedBg,    text: colors.modRejectedText    },
};

function formatTimestamp(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

/** One-line device summary, e.g. "android 14 · samsung SM-G991B · v1.0.0" */
function describeReport(report) {
  const d   = report.data || {};
  const dev = d.deviceInfo || {};
  const parts = [];
  if (dev.platform) parts.push(`${dev.platform}${dev.version ? ` ${dev.version}` : ''}`);
  const device = [dev.brand || dev.manufacturer, dev.model].filter(Boolean).join(' ');
  if (device) parts.push(device);
  if (d.appVersion && d.appVersion !== 'unknown') parts.push(`v${d.appVersion}`);
  return parts.join(' · ');
}

function ReportRow({ report, appSettings, ollamaEnabled, onAnalyse, onDismiss }) {
  const sev      = report.aiAnalysis?.severity;
  const sevStyle = sev ? (SEVERITY_STYLE[sev] || SEVERITY_STYLE.medium) : null;
  const errors   = Array.isArray(report.data?.errors) ? report.data.errors : [];
  const summary  = describeReport(report);
  const shotUrl  = report.screenshotFile && report.serverId
    ? bugReportScreenshotUrl(appSettings, report.serverId)
    : null;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Ionicons name="bug-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.cardTime}>{formatTimestamp(report.submittedAt)}</Text>
        {report.serverId ? (
          <Text style={styles.cardServerId} numberOfLines={1}>#{String(report.serverId).slice(-8)}</Text>
        ) : null}
        {sevStyle ? (
          <View style={[styles.pill, { backgroundColor: sevStyle.bg }]}>
            <Text style={[styles.pillText, { color: sevStyle.text }]}>{sev}</Text>
          </View>
        ) : null}
        <View style={styles.spacer} />
        <Pressable
          onPress={() => onDismiss(report.id)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss report"
          hitSlop={8}
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Context: device · version · error count, plus screenshot thumbnail */}
      <View style={styles.contextRow}>
        <View style={styles.contextText}>
          {summary ? <Text style={styles.contextLine}>{summary}</Text> : null}
          <Text style={styles.contextLine}>
            {errors.length === 0
              ? 'No JS errors captured'
              : `${errors.length} JS error${errors.length === 1 ? '' : 's'} captured`}
            {report.screenshotFile ? ' · screenshot attached' : ' · no screenshot'}
          </Text>
          {errors[0]?.message ? (
            <Text style={styles.errorPreview} numberOfLines={2}>{errors[0].message}</Text>
          ) : null}
        </View>
        {shotUrl ? (
          <Image
            source={{ uri: shotUrl }}
            style={styles.thumb}
            resizeMode="cover"
            accessibilityLabel="Screenshot"
          />
        ) : null}
      </View>

      {/* AI analysis */}
      {report.aiAnalysis ? (
        <View style={styles.analysisBlock}>
          <Text style={styles.analysisTitle}>Likely cause</Text>
          <Text style={styles.analysisBody}>{report.aiAnalysis.likelyCause || '—'}</Text>
          {Array.isArray(report.aiAnalysis.suggestions) && report.aiAnalysis.suggestions.length > 0 ? (
            <>
              <Text style={[styles.analysisTitle, { marginTop: spacing.sm }]}>Suggestions</Text>
              {report.aiAnalysis.suggestions.map((s, i) => (
                <Text key={i} style={styles.analysisBody}>· {String(s)}</Text>
              ))}
            </>
          ) : null}
        </View>
      ) : ollamaEnabled ? (
        <Pressable
          onPress={() => onAnalyse(report)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.analyseButton, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="sparkles-outline" size={16} color={colors.textOnDark} />
          <Text style={styles.analyseButtonText}>Analyse with Ollama</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function AdminBugReportsScreen() {
  const insets          = useSafeAreaInsets();
  const appSettings     = useStore((s) => s.appSettings);
  const bugReports      = useStore((s) => s.bugReports);
  const setBugReports        = useStore((s) => s.setBugReports);
  const setBugReportAnalysis = useStore((s) => s.setBugReportAnalysis);
  const dismissBugReport     = useStore((s) => s.dismissBugReport);

  const [refreshing, setRefreshing] = useState(false);
  const [loadError,  setLoadError]  = useState(null);
  const [analysing,  setAnalysing]  = useState({}); // { [bugId]: bool }
  const [errors,     setErrors]     = useState({}); // { [bugId]: string }

  const ollamaEnabled = !!appSettings?.bugReportOllamaEnabled;
  const visible = bugReports.filter((r) => !r.dismissed);

  // ── Load from the server ──
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      const list = await fetchBugReports(appSettings);
      setBugReports(list);
    } catch (err) {
      setLoadError(`${err.message} Showing reports cached on this device.`);
    } finally {
      setRefreshing(false);
    }
  }, [appSettings, setBugReports]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Analyse ──
  const handleAnalyse = async (report) => {
    setAnalysing((a) => ({ ...a, [report.id]: true }));
    setErrors((e) => ({ ...e, [report.id]: null }));
    try {
      const result = await analyseBugReport(appSettings, report);
      setBugReportAnalysis(report.id, result);
      // Persist so other admin devices see the same analysis. Best-effort:
      // the local copy already shows it.
      if (report.serverId) {
        updateBugReport(appSettings, report.serverId, { aiAnalysis: result }).catch(() => {});
      }
    } catch (err) {
      setErrors((e) => ({ ...e, [report.id]: err.message }));
    } finally {
      setAnalysing((a) => ({ ...a, [report.id]: false }));
    }
  };

  // ── Dismiss ──
  const handleDismiss = (bugId) => {
    dismissBugReport(bugId);
    const report = bugReports.find((r) => r.id === bugId);
    if (report?.serverId) {
      updateBugReport(appSettings, report.serverId, { dismissed: true }).catch(() => {});
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      {loadError ? (
        <View style={styles.notice}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.modFlaggedText} />
          <Text style={styles.noticeText}>{loadError}</Text>
        </View>
      ) : null}

      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={44} color={colors.border} />
          <Text style={styles.emptyText}>No open bug reports.</Text>
        </View>
      ) : (
        visible.map((report) => (
          <View key={report.id}>
            {analysing[report.id] ? (
              <View style={[styles.card, styles.cardLoading]}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>Analysing with Ollama…</Text>
              </View>
            ) : (
              <ReportRow
                report={report}
                appSettings={appSettings}
                ollamaEnabled={ollamaEnabled}
                onAnalyse={handleAnalyse}
                onDismiss={handleDismiss}
              />
            )}
            {errors[report.id] ? (
              <Text style={styles.errorText}>{errors[report.id]}</Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.adminSurface },
  content:   { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  notice: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             spacing.sm,
    backgroundColor: colors.modFlaggedBg,
    borderRadius:    radius.sm,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  noticeText: { ...typography.caption, color: colors.modFlaggedText, flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.adminBorder,
    padding:         spacing.lg,
    marginBottom:    spacing.sm,
  },
  cardLoading: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.md,
    marginBottom:   spacing.sm,
  },
  loadingText: { ...typography.body, color: colors.textSecondary },
  cardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.sm,
    marginBottom:   spacing.md,
  },
  cardTime: { ...typography.caption, color: colors.textSecondary },
  cardServerId: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  spacer: { flex: 1 },
  pill: {
    borderRadius:    radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical:   2,
  },
  pillText:     { ...typography.badge },
  iconBtn:      { padding: spacing.xs },
  contextRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           spacing.md,
    marginBottom:  spacing.md,
  },
  contextText:  { flex: 1, gap: 2 },
  contextLine:  { ...typography.caption, color: colors.textSecondary },
  errorPreview: { ...typography.caption, color: colors.textPrimary, marginTop: spacing.xs },
  thumb: {
    width:           56,
    height:          100,
    borderRadius:    radius.sm,
    borderWidth:     1,
    borderColor:     colors.border,
    backgroundColor: colors.adminSurface,
  },
  analysisBlock: {
    backgroundColor: colors.adminSurface,
    borderRadius:    radius.sm,
    padding:         spacing.md,
  },
  analysisTitle: { ...typography.badge, color: colors.textSecondary, marginBottom: 2 },
  analysisBody:  { ...typography.body,  color: colors.textPrimary, marginBottom: spacing.xs },
  analyseButton: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.sm,
    backgroundColor: colors.primary,
    borderRadius:    radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.sm,
    alignSelf:       'flex-start',
  },
  analyseButtonText: { ...typography.badge, color: colors.textOnDark },
  errorText: { ...typography.caption, color: colors.modRejectedText, marginBottom: spacing.sm, marginTop: -spacing.xs },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.md },
  emptyText: { ...typography.body, color: colors.textSecondary },
});

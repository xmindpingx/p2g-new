// places2go — AdminBugReportsScreen
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Lists submitted bug reports (newest first). For each report, the admin can
// run Ollama analysis to surface the likely cause, severity, and fix suggestions,
// or dismiss reports that have been resolved.

import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../theme';
import useStore from '../store/useStore';
import { analyseBugReport } from '../services/bugReport';

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
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function ReportRow({ report, appSettings, onAnalyse, onDismiss }) {
  const sev     = report.aiAnalysis?.severity;
  const sevStyle = sev ? (SEVERITY_STYLE[sev] || SEVERITY_STYLE.medium) : null;

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
          accessibilityLabel="Dismiss report"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* AI analysis */}
      {report.aiAnalysis ? (
        <View style={styles.analysisBlock}>
          <Text style={styles.analysisTitle}>Likely cause</Text>
          <Text style={styles.analysisBody}>{report.aiAnalysis.likelyCause || '—'}</Text>
          {report.aiAnalysis.suggestions?.length > 0 ? (
            <>
              <Text style={[styles.analysisTitle, { marginTop: spacing.sm }]}>Suggestions</Text>
              {report.aiAnalysis.suggestions.map((s, i) => (
                <Text key={i} style={styles.analysisBody}>· {s}</Text>
              ))}
            </>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={() => onAnalyse(report)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.analyseButton, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="sparkles-outline" size={16} color={colors.textOnDark} />
          <Text style={styles.analyseButtonText}>Analyse with Ollama</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function AdminBugReportsScreen() {
  const insets          = useSafeAreaInsets();
  const appSettings     = useStore((s) => s.appSettings);
  const bugReports      = useStore((s) => s.bugReports);
  const setBugReportAnalysis = useStore((s) => s.setBugReportAnalysis);
  const dismissBugReport     = useStore((s) => s.dismissBugReport);

  const [analysing, setAnalysing] = useState({}); // { [bugId]: bool }
  const [errors,    setErrors]    = useState({}); // { [bugId]: string }

  const visible = bugReports.filter((r) => !r.dismissed);

  const handleAnalyse = async (report) => {
    setAnalysing((a) => ({ ...a, [report.id]: true }));
    setErrors((e) => ({ ...e, [report.id]: null }));
    try {
      const result = await analyseBugReport(appSettings, report);
      setBugReportAnalysis(report.id, result);
    } catch (err) {
      setErrors((e) => ({ ...e, [report.id]: err.message }));
    } finally {
      setAnalysing((a) => ({ ...a, [report.id]: false }));
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
    >
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
                onAnalyse={handleAnalyse}
                onDismiss={dismissBugReport}
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
  cardServerId: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  spacer: { flex: 1 },
  pill: {
    borderRadius:    radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical:   2,
  },
  pillText:     { ...typography.badge },
  iconBtn:      { padding: spacing.xs },
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
    marginTop:       spacing.sm,
  },
  analyseButtonText: { ...typography.badge, color: colors.textOnDark },
  errorText: { ...typography.caption, color: colors.modRejectedText, marginBottom: spacing.sm, marginTop: -spacing.xs },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.md },
  emptyText: { ...typography.body, color: colors.textSecondary },
});

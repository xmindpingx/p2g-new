// places2go — AdminSettingsScreen
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Every key in DEFAULT_APP_SETTINGS renders as a control, grouped by
// SETTINGS_GROUP_ORDER, gated by ADMIN_ONLY_SETTINGS / MOD_ALLOWED_SETTINGS.
// The Ollama section has a "Test connection" action that pings /api/tags and,
// on success, offers the returned model names as tap-to-select choices for the
// text and vision model fields.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Switch, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, fonts, fontSizes } from '../theme';
import useStore, { USER_ROLES } from '../store/useStore';
import {
  DEFAULT_APP_SETTINGS, ADMIN_ONLY_SETTINGS, MOD_ALLOWED_SETTINGS,
  APP_SETTING_LABELS, SETTINGS_GROUPS, SETTINGS_GROUP_LABELS, SETTINGS_GROUP_ORDER, SETTING_GROUP_MAP,
} from '../constants/moderation';
import { Chip } from '../components/FilterChips';
import PrimaryButton from '../components/PrimaryButton';
import { PAYOUT_SETTING_TOOLTIPS } from '../constants/payoutMethods';

// Control type per key. Anything not listed falls back on typeof the default.
const CONTROL = {
  ollamaApiKey:                'secret',
  ollamaBaseUrl:               'url',
  ollamaTextModerationModel:   'model',
  ollamaVisionModerationModel: 'model',
  ollamaOutreachModel:         'model',
  overpassBaseUrl:             'url',
  ollamaConnectionVerified:    'readonly',
  paymentsApiBaseUrl:          'url',
  liveMapApiBaseUrl:           'url',
  routingBaseUrl:              'url',
};

// Placeholder text for URL-type settings
const URL_PLACEHOLDER = {
  ollamaBaseUrl:      'http://your-server:11434',
  overpassBaseUrl:    'http://your-server:8097/api/interpreter',
  paymentsApiBaseUrl: 'http://your-server:3000',
  liveMapApiBaseUrl:  'http://your-server:3000',
  routingBaseUrl:     'https://your-osrm-server',
};

// Short explanations shown under a group
const GROUP_NOTES = {
  [SETTINGS_GROUPS.STRIPE]:     'Only the publishable key belongs in the app. Your secret key stays on the payments server (see server/stripe-server.example.js). The Apple Pay merchant ID must also be set in app.json before building.',
  [SETTINGS_GROUPS.LEGAL]:      'These values are inserted into the Terms, Privacy Policy and the ownership notice shown in the app. Use ® only once the mark is registered, and a patent notice only for a filed application or issued patent.',
  [SETTINGS_GROUPS.AUTOMATION]: 'Off by default. Turn on only after you have watched a few credits go through by hand. Every auto-approval records the checks it passed, and every auto-payment is capped per credit and per day.',
  [SETTINGS_GROUPS.ANTI_ABUSE]: 'Presence evidence is recorded on the device while Add Place is open. Indoor GPS is typically accurate to tens of metres; every figure is shown to you with its reported accuracy.',
  [SETTINGS_GROUPS.LIVE_MAP]:   'Only users who turn on "Share my location" appear, as anonymous dots, and only to other sharers. Coordinates are rounded before leaving the device.',
  [SETTINGS_GROUPS.DIRECTIONS]: 'The public OSRM demo server is for testing only. Self-host OSRM with car and foot profiles for production.',
  [SETTINGS_GROUPS.PINS]:       'Pin colours: black no restroom on site · red not open to the public · orange flagged unsafe · yellow low rated · gold best-rated within the radius · silver highly rated · green purchase required · blue normal.',
};

// Validation bounds for numeric settings
const BOUNDS = {
  maxPhotosPerPlace:      { min: 0,   max: 50,    int: true },
  maxPhotosPerReview:     { min: 0,   max: 20,    int: true },
  payoutAmountUSD:        { min: 0,   max: 1000,  int: false },
  reviewMinTextLength:    { min: 0,   max: 2000,  int: true },
  reviewMinAmenityChecks: { min: 0,   max: 60,    int: true },
  nsfwFlagThreshold:      { min: 0,   max: 1,     int: false },
  ollamaTemperature:      { min: 0,   max: 2,     int: false },
  ollamaTopP:             { min: 0,   max: 1,     int: false },
  ollamaTopK:             { min: 0,   max: 1000,  int: true },
  ollamaNumCtx:           { min: 128, max: 131072, int: true },
  ollamaMaxTokens:        { min: 1,   max: 8192,  int: true },
  ollamaTimeoutMs:        { min: 1000, max: 120000, int: true },
  cobrandingMaxSuggestedItems:     { min: 1,   max: 20,    int: true },
  cobrandingHeadlineMaxLength:     { min: 10,  max: 200,   int: true },
  donationMinimumUSD:              { min: 0.5, max: 1000,  int: false },
  legalMinimumAge:                 { min: 13,  max: 21,    int: true },
  legalContributorMinimumAge:      { min: 13,  max: 21,    int: true },
  submissionPresenceRadiusMeters:  { min: 10,  max: 2000,  int: true },
  presenceRadiusMeters:            { min: 10,  max: 1000,  int: true },
  presenceInnerRadiusMeters:       { min: 3,   max: 200,   int: true },
  presenceMinDwellSeconds:         { min: 0,   max: 3600,  int: true },
  presenceMaxAccuracyMeters:       { min: 5,   max: 500,   int: true },
  presenceSampleIntervalSeconds:   { min: 2,   max: 120,   int: true },
  presencePostSubmitWindowSeconds: { min: 0,   max: 900,   int: true },
  payoutDailyCapPerUser:           { min: 0,   max: 100,   int: true },
  payoutCooldownMinutes:           { min: 0,   max: 1440,  int: true },
  duplicateRadiusMeters:           { min: 0,   max: 500,   int: true },
  liveMapUpdateIntervalSeconds:    { min: 10,  max: 600,   int: true },
  liveMapCoarsenDecimals:          { min: 1,   max: 5,     int: true },
  liveMapStaleAfterSeconds:        { min: 30,  max: 3600,  int: true },
  liveMapRadiusKm:                 { min: 1,   max: 200,   int: true },
  pinBestRadiusMiles:              { min: 0.5, max: 100,   int: false },
  pinBestMinReviews:               { min: 1,   max: 100,   int: true },
  pinLowRatingMax:                 { min: 1,   max: 5,     int: false },
  pinNiceRatingMin:                { min: 1,   max: 5,     int: false },
  pinUnsafeMinReports:             { min: 0,   max: 100,   int: true },
  approachAlertMeters:             { min: 25,  max: 2000,  int: true },
  handsFreeListenSeconds:          { min: 3,   max: 30,    int: true },
  autoApproveMaxGpsAccuracyMeters: { min: 5,   max: 200,   int: true },
  autoApproveMinDwellSeconds:      { min: 0,   max: 3600,  int: true },
  autoApproveMinReviewChars:       { min: 0,   max: 2000,  int: true },
  autoApproveMinPhotos:            { min: 0,   max: 20,    int: true },
  autoApproveMinPriorApproved:     { min: 0,   max: 100,   int: true },
  autoApproveMaxPerUserPerDay:     { min: 0,   max: 50,    int: true },
  autoPayMaxAmountUSD:             { min: 0,   max: 1000,  int: false },
  autoPayDailyLimitUSD:            { min: 0,   max: 10000, int: false },
  partnerIncentiveAmountUSD:       { min: 0,   max: 1000,  int: false },
};

// Tooltips for the automation switches (payout-method tooltips come from constants/payoutMethods.js)
const AUTOMATION_TOOLTIPS = {
  adminFakeLocationEnabled:
    'On the web map an administrator can right-click a point and choose "Set my location here (test)". The whole app then behaves as if the device were there — distances, nearby results, the country check for payout methods, and Add Place presence evidence. Every sample from a test location is marked as a mock location, so risk flags appear, credits are blocked while "no credit on mock location" is on, and automatic approval refuses them. It is never sent to the live map. Only administrators are affected.',
  autoApproveEnabled:
    'When on, every pending place + review credit is checked against all the rules in this group each time the Admin panel opens (or when you tap Auto-approve). A credit is approved only if every rule passes; anything else stays pending for you. Each approved credit keeps the list of checks it passed.',
  autoApproveAcceptModeratePresence:
    'Presence levels come from the GPS samples recorded while Add Place was open. Strong = within the place radius with enough dwell time or approach/departure movement. Moderate = within the radius but no movement and dwell below the minimum. Off means Strong only.',
  autoApproveRequireAiClean:
    'Requires an Ollama verdict of CLEAN on the review text, the place notes and every photo. Items still awaiting screening, flagged, or errored keep the credit pending.',
  autoPayEnabled:
    'Auto-pay uses Stripe Connect only — the one payout method that can be sent programmatically. A contributor without a linked Stripe account stays approved-but-unpaid for you to pay by hand (Cash App, Zelle, Apple Pay, Google Pay). Requires the payments server URL in the Stripe group.',
};

function NumberField({ value, onCommit, bounds, editable }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n)) { setText(String(value)); return; }
    let v = bounds?.int ? Math.round(n) : n;
    if (bounds) v = Math.min(bounds.max, Math.max(bounds.min, v));
    setText(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      editable={editable}
      keyboardType="decimal-pad"
      returnKeyType="done"
      style={[styles.numberInput, !editable && styles.inputDisabled]}
    />
  );
}

function TextField({ value, onCommit, editable, secret = false, placeholder }) {
  const [text, setText] = useState(value ?? '');
  const [reveal, setReveal] = useState(false);
  const commit = () => { if (text !== value) onCommit(text); };
  return (
    <View style={styles.textFieldRow}>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        editable={editable}
        secureTextEntry={secret && !reveal}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        returnKeyType="done"
        style={[styles.textInput, !editable && styles.inputDisabled]}
      />
      {secret ? (
        <Pressable onPress={() => setReveal((r) => !r)} hitSlop={8} accessibilityRole="button" accessibilityLabel={reveal ? 'Hide' : 'Show'}>
          <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function AdminSettingsScreen() {
  const insets       = useSafeAreaInsets();
  const currentUser  = useStore((s) => s.currentUser);
  const appSettings  = useStore((s) => s.appSettings);
  const updateAppSetting       = useStore((s) => s.updateAppSetting);
  const verifyOllamaConnection = useStore((s) => s.verifyOllamaConnection);

  const isAdmin = currentUser.role === USER_ROLES.ADMIN;
  const canEdit = (key) => (ADMIN_ONLY_SETTINGS.has(key) ? isAdmin : MOD_ALLOWED_SETTINGS.has(key) || isAdmin);

  const [testing, setTesting]   = useState(false);
  const [tipOpen, setTipOpen]   = useState(null); // setting key whose tooltip is expanded
  const [models, setModels]     = useState([]);
  const [testError, setTestError] = useState(null);

  const commit = useCallback((key, value) => {
    try { updateAppSetting(key, value); }
    catch (err) { showAlert('Not saved', err.message); }
  }, [updateAppSetting]);

  const testConnection = useCallback(async () => {
    setTesting(true); setTestError(null); setModels([]);
    const result = await verifyOllamaConnection();
    setTesting(false);
    if (result.ok) setModels(result.models);
    else setTestError(result.error);
  }, [verifyOllamaConnection]);

  const groups = useMemo(() => SETTINGS_GROUP_ORDER.map((g) => ({
    key: g,
    label: SETTINGS_GROUP_LABELS[g],
    keys: Object.keys(DEFAULT_APP_SETTINGS).filter((k) => SETTING_GROUP_MAP[k] === g),
  })), []);

  const renderControl = (key) => {
    const value    = appSettings[key];
    const editable = canEdit(key);
    const type     = CONTROL[key] || typeof DEFAULT_APP_SETTINGS[key];

    if (type === 'boolean') {
      return (
        <Switch
          value={!!value}
          onValueChange={(v) => commit(key, v)}
          disabled={!editable}
          trackColor={{ true: colors.success, false: colors.border }}
          thumbColor={colors.surface}
        />
      );
    }
    if (type === 'number') {
      return <NumberField key={`${key}-${value}`} value={value} onCommit={(v) => commit(key, v)} bounds={BOUNDS[key]} editable={editable} />;
    }
    if (type === 'readonly') {
      return (
        <View style={[styles.pill, { backgroundColor: value ? colors.connVerifiedBg : colors.connUnverifiedBg }]}>
          <Text style={[styles.pillText, { color: value ? colors.connVerifiedText : colors.connUnverifiedText }]}>{value ? 'Yes' : 'No'}</Text>
        </View>
      );
    }
    if (type === 'model') {
      return (
        <View style={styles.modelWrap}>
          <TextField key={`${key}-${value}`} value={value} onCommit={(v) => commit(key, v.trim())} editable={editable} placeholder="model name" />
          {models.length > 0 && editable ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modelChips} keyboardShouldPersistTaps="handled">
              {models.map((m) => <Chip key={m} label={m} active={value === m} onPress={() => commit(key, m)} />)}
            </ScrollView>
          ) : null}
        </View>
      );
    }
    return (
      <TextField
        key={`${key}-${value}`}
        value={value}
        onCommit={(v) => commit(key, v.trim())}
        editable={editable}
        secret={type === 'secret'}
        placeholder={type === 'url' ? (URL_PLACEHOLDER[key] || 'https://') : ''}
      />
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
      {!isAdmin ? (
        <View style={styles.roleNote}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.roleNoteText}>Greyed-out settings require an administrator.</Text>
        </View>
      ) : null}

      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text style={styles.groupTitle}>{group.label.toUpperCase()}</Text>
          <View style={styles.card}>
            {group.keys.map((key, i) => {
              const inline = ['boolean', 'number', 'readonly'].includes(CONTROL[key] || typeof DEFAULT_APP_SETTINGS[key]);
              const tip = PAYOUT_SETTING_TOOLTIPS[key] || AUTOMATION_TOOLTIPS[key];
              return (
                <View key={key} style={[styles.row, i === group.keys.length - 1 && styles.rowLast]}>
                  <View style={[inline && styles.rowInline]}>
                    <View style={[styles.rowLabelWrap, inline && styles.rowLabelInline]}>
                      <Text style={[styles.rowLabel, !canEdit(key) && styles.rowLabelDisabled]}>
                        {APP_SETTING_LABELS[key] || key}
                      </Text>
                      {tip ? (
                        <Pressable onPress={() => setTipOpen(tipOpen === key ? null : key)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`About ${APP_SETTING_LABELS[key] || key}`} style={styles.tipButton}>
                          <Ionicons name={tipOpen === key ? 'information-circle' : 'information-circle-outline'} size={18} color={colors.textSecondary} />
                        </Pressable>
                      ) : null}
                    </View>
                    {renderControl(key)}
                  </View>
                  {tip && tipOpen === key ? (
                    <View style={styles.tip}><Text style={styles.tipText}>{tip}</Text></View>
                  ) : null}
                </View>
              );
            })}

            {GROUP_NOTES[group.key] ? <Text style={styles.groupNote}>{GROUP_NOTES[group.key]}</Text> : null}

            {group.key === SETTINGS_GROUPS.OLLAMA_CONN ? (
              <View style={styles.testWrap}>
                <PrimaryButton
                  label={testing ? 'Testing…' : 'Test connection'}
                  variant="secondary"
                  onPress={testConnection}
                  disabled={!isAdmin || !appSettings.ollamaBaseUrl}
                  loading={testing}
                />
                {testError ? (
                  <View style={[styles.testResult, { backgroundColor: colors.connErrorBg }]}>
                    <Text style={[styles.testResultText, { color: colors.connErrorText }]}>{testError}</Text>
                  </View>
                ) : null}
                {models.length > 0 ? (
                  <View style={[styles.testResult, { backgroundColor: colors.connVerifiedBg }]}>
                    <Text style={[styles.testResultText, { color: colors.connVerifiedText }]}>
                      Connected. {models.length} model{models.length === 1 ? '' : 's'} available — tap one in the Model Selection section below.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      ))}

      <Text style={styles.footnote}>
        Values apply immediately on this device. Your backend should read the same settings from your server-side config; this panel is the source of truth for what the app enforces locally.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.adminSurface },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  roleNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  roleNoteText: { ...typography.caption },
  group: { marginBottom: spacing.lg },
  groupTitle: { ...typography.adminSectionHeader, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.adminBorder, paddingHorizontal: spacing.lg },
  row: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, gap: spacing.sm },
  rowInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { ...typography.body, flexShrink: 1 },
  rowLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tipButton: { padding: 2 },
  tip: { marginTop: spacing.sm, backgroundColor: colors.adminSurface, borderRadius: radius.sm, padding: spacing.md },
  tipText: { ...typography.caption, color: colors.textPrimary },
  rowLabelInline: { flex: 1, marginRight: spacing.md },
  rowLabelDisabled: { color: colors.textSecondary },
  numberInput: { minWidth: 88, height: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.md, fontFamily: fonts.medium, fontSize: fontSizes.md, color: colors.textPrimary, textAlign: 'right' },
  textFieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  textInput: { flex: 1, height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.md, fontFamily: fonts.regular, fontSize: fontSizes.md, color: colors.textPrimary },
  inputDisabled: { opacity: 0.5 },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pillText: { ...typography.badge },
  modelWrap: { gap: spacing.sm },
  modelChips: { gap: spacing.sm },
  testWrap: { paddingVertical: spacing.md, gap: spacing.sm },
  testResult: { borderRadius: radius.sm, padding: spacing.sm },
  testResultText: { ...typography.caption },
  groupNote: { ...typography.label, paddingVertical: spacing.md },
  footnote: { ...typography.label, textAlign: 'center' },
});

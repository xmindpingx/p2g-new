// places2go — AdminSettingsScreen
// Every key in DEFAULT_APP_SETTINGS renders as a control, grouped by
// SETTINGS_GROUP_ORDER, gated by ADMIN_ONLY_SETTINGS / MOD_ALLOWED_SETTINGS.
// The Ollama section has a "Test connection" action that pings /api/tags and,
// on success, offers the returned model names as tap-to-select choices for the
// text and vision model fields.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Switch, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native';
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

// Control type per key. Anything not listed falls back on typeof the default.
const CONTROL = {
  ollamaApiKey:                'secret',
  ollamaBaseUrl:               'url',
  ollamaTextModerationModel:   'model',
  ollamaVisionModerationModel: 'model',
  ollamaConnectionVerified:    'readonly',
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
  const [models, setModels]     = useState([]);
  const [testError, setTestError] = useState(null);

  const commit = useCallback((key, value) => {
    try { updateAppSetting(key, value); }
    catch (err) { Alert.alert('Not saved', err.message); }
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
        placeholder={type === 'url' ? 'http://your-server:11434' : ''}
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
              return (
                <View key={key} style={[styles.row, inline && styles.rowInline, i === group.keys.length - 1 && styles.rowLast]}>
                  <Text style={[styles.rowLabel, !canEdit(key) && styles.rowLabelDisabled, inline && styles.rowLabelInline]}>
                    {APP_SETTING_LABELS[key] || key}
                  </Text>
                  {renderControl(key)}
                </View>
              );
            })}

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
  rowLabel: { ...typography.body },
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
  footnote: { ...typography.label, textAlign: 'center' },
});

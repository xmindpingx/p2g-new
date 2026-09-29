// places2go — AdminAmenitiesScreen
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Two tabs:
//   Registry    — every official amenity grouped; rename inline, toggle active,
//                 add a new official amenity or vending item.
//   Suggestions — user submissions pending review; approve (promotes to
//                 official and applies to tagged places) or reject with reason.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Switch, Pressable, Modal, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { showAlert } from '../utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, fonts, fontSizes, shadows } from '../theme';
import useStore from '../store/useStore';
import { AMENITY_GROUPS, AMENITY_GROUP_ORDER, AMENITY_GROUP_LABELS, CUSTOM_AMENITY_STATUS, CUSTOM_AMENITY_MAX_LABEL_LENGTH } from '../constants/amenities';
import { Chip } from '../components/FilterChips';
import PrimaryButton from '../components/PrimaryButton';

const TABS = [
  { key: 'registry',    label: 'Registry' },
  { key: 'suggestions', label: 'Suggestions' },
];

// ---------------------------------------------------------------------------
// Add-official-amenity sheet
// ---------------------------------------------------------------------------
function AddAmenitySheet({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const addOfficialAmenity = useStore((s) => s.addOfficialAmenity);
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState(AMENITY_GROUPS.HYGIENE);

  const submit = () => {
    try {
      addOfficialAmenity({ label, group, isVending: group === AMENITY_GROUPS.VENDING });
      setLabel(''); onClose();
    } catch (err) {
      showAlert('Could not add', err.message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>New official amenity</Text>
          <Text style={styles.sheetCaption}>Available on every form immediately. Choose "Vending Products" for a vending item.</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Hand sanitizer"
            placeholderTextColor={colors.placeholder}
            maxLength={CUSTOM_AMENITY_MAX_LABEL_LENGTH}
            autoFocus
            style={styles.input}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
            {AMENITY_GROUP_ORDER.map((g) => <Chip key={g} label={AMENITY_GROUP_LABELS[g]} active={group === g} onPress={() => setGroup(g)} />)}
          </ScrollView>
          <PrimaryButton label="Add amenity" onPress={submit} disabled={!label.trim()} style={styles.sheetButton} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reject-suggestion sheet
// ---------------------------------------------------------------------------
function RejectSheet({ submission, onClose, onConfirm }) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');
  if (!submission) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>Reject "{submission.label}"?</Text>
          <Text style={styles.sheetCaption}>The reason is sent to the person who suggested it.</Text>
          <TextInput value={reason} onChangeText={setReason} placeholder="Reason (optional)" placeholderTextColor={colors.placeholder} style={styles.input} multiline />
          <PrimaryButton label="Reject" onPress={() => onConfirm(reason)} style={styles.sheetButton} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Registry row — inline rename + active toggle
// ---------------------------------------------------------------------------
function RegistryRow({ amenity, last }) {
  const updateAmenityLabel = useStore((s) => s.updateAmenityLabel);
  const setAmenityActive   = useStore((s) => s.setAmenityActive);
  const [label, setLabel]  = useState(amenity.label);

  const commit = () => {
    const t = label.trim();
    if (!t) { setLabel(amenity.label); return; }
    if (t !== amenity.label) {
      try { updateAmenityLabel(amenity.key, t); } catch (err) { showAlert('Not saved', err.message); setLabel(amenity.label); }
    }
  };

  return (
    <View style={[styles.row, last && styles.rowLast, !amenity.isActive && styles.rowInactive]}>
      <TextInput value={label} onChangeText={setLabel} onBlur={commit} onSubmitEditing={commit} returnKeyType="done" style={styles.rowInput} />
      <View style={styles.rowRight}>
        {amenity.addedBy !== 'system' ? <Text style={styles.rowTag}>custom</Text> : null}
        <Switch
          value={amenity.isActive}
          onValueChange={(v) => { try { setAmenityActive(amenity.key, v); } catch (err) { showAlert('Not saved', err.message); } }}
          trackColor={{ true: colors.success, false: colors.border }}
          thumbColor={colors.surface}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function AdminAmenitiesScreen({ route }) {
  const insets = useSafeAreaInsets();
  const officialAmenities        = useStore((s) => s.officialAmenities);
  const customAmenitySubmissions = useStore((s) => s.customAmenitySubmissions);
  const approveCustomAmenity     = useStore((s) => s.approveCustomAmenity);
  const rejectCustomAmenity      = useStore((s) => s.rejectCustomAmenity);
  const places                   = useStore((s) => s.places);

  const [tab, setTab]           = useState(route.params?.tab === 'suggestions' ? 'suggestions' : 'registry');
  const [adding, setAdding]     = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [showResolved, setShowResolved] = useState(false);

  const grouped = useMemo(() => AMENITY_GROUP_ORDER.map((g) => ({
    key: g, label: AMENITY_GROUP_LABELS[g],
    items: officialAmenities.filter((a) => a.group === g),
  })).filter((g) => g.items.length > 0), [officialAmenities]);

  const pending  = useMemo(() => customAmenitySubmissions.filter((s) => s.status === CUSTOM_AMENITY_STATUS.PENDING), [customAmenitySubmissions]);
  const resolved = useMemo(() => customAmenitySubmissions.filter((s) => s.status !== CUSTOM_AMENITY_STATUS.PENDING), [customAmenitySubmissions]);

  const taggedCount = useCallback((id) => places.filter((p) => p.customAmenityIds?.includes(id)).length, [places]);

  const approve = useCallback((s) => {
    showAlert('Approve suggestion?', `"${s.label}" becomes an official amenity in ${AMENITY_GROUP_LABELS[s.suggestedGroup]} and is applied to ${taggedCount(s.id)} tagged place${taggedCount(s.id) === 1 ? '' : 's'}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => { try { approveCustomAmenity(s.id); } catch (err) { showAlert('Could not approve', err.message); } } },
    ]);
  }, [approveCustomAmenity, taggedCount]);

  const confirmReject = useCallback((reason) => {
    if (!rejecting) return;
    try { rejectCustomAmenity(rejecting.id, reason); } catch (err) { showAlert('Could not reject', err.message); }
    setRejecting(null);
  }, [rejecting, rejectCustomAmenity]);

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="button" style={[styles.tab, tab === t.key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}{t.key === 'suggestions' && pending.length > 0 ? ` (${pending.length})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        {tab === 'registry' ? (
          <>
            <PrimaryButton label="Add official amenity or vending item" variant="secondary" onPress={() => setAdding(true)} style={styles.addButton} />
            {grouped.map((g) => (
              <View key={g.key} style={styles.group}>
                <Text style={styles.groupTitle}>{g.label.toUpperCase()} · {g.items.filter((a) => a.isActive).length}/{g.items.length} active</Text>
                <View style={styles.card}>
                  {g.items.map((a, i) => <RegistryRow key={a.key} amenity={a} last={i === g.items.length - 1} />)}
                </View>
              </View>
            ))}
            <Text style={styles.footnote}>Tap a name to rename it. Switching an amenity off hides it from forms; places that already have it keep the data.</Text>
          </>
        ) : (
          <>
            {pending.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="bulb-outline" size={32} color={colors.textSecondary} />
                <Text style={styles.emptyTitle}>No pending suggestions</Text>
                <Text style={styles.emptyCaption}>Users can suggest amenities from the Add a Place form.</Text>
              </View>
            ) : pending.map((s) => (
              <View key={s.id} style={styles.suggestion}>
                <Text style={styles.suggestionLabel}>{s.label}</Text>
                <Text style={styles.suggestionMeta}>
                  {AMENITY_GROUP_LABELS[s.suggestedGroup]} · tagged on {taggedCount(s.id)} place{taggedCount(s.id) === 1 ? '' : 's'}
                </Text>
                <View style={styles.actions}>
                  <PrimaryButton label="Reject"  variant="secondary" onPress={() => setRejecting(s)} style={styles.action} />
                  <PrimaryButton label="Approve" onPress={() => approve(s)} style={styles.action} />
                </View>
              </View>
            ))}

            {resolved.length > 0 ? (
              <Pressable onPress={() => setShowResolved((v) => !v)} style={styles.resolvedToggle} accessibilityRole="button">
                <Text style={styles.resolvedToggleText}>{showResolved ? 'Hide' : 'Show'} {resolved.length} resolved</Text>
                <Ionicons name={showResolved ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
              </Pressable>
            ) : null}
            {showResolved ? resolved.map((s) => (
              <View key={s.id} style={[styles.suggestion, styles.suggestionResolved]}>
                <Text style={styles.suggestionLabel}>{s.label}</Text>
                <Text style={[styles.suggestionMeta, { color: s.status === CUSTOM_AMENITY_STATUS.APPROVED ? colors.modApprovedText : colors.modRejectedText }]}>
                  {s.status === CUSTOM_AMENITY_STATUS.APPROVED ? `Approved → ${s.officialKey}` : `Rejected${s.rejectionReason ? `: ${s.rejectionReason}` : ''}`}
                </Text>
              </View>
            )) : null}
          </>
        )}
      </ScrollView>

      <AddAmenitySheet visible={adding} onClose={() => setAdding(false)} />
      {rejecting ? <RejectSheet submission={rejecting} onClose={() => setRejecting(null)} onConfirm={confirmReject} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.adminSurface },
  tabs: { flexDirection: 'row', margin: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, borderWidth: 1, borderColor: colors.adminBorder },
  tab: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.captionMedium, color: colors.textPrimary },
  tabTextActive: { color: colors.textOnDark },
  content: { paddingHorizontal: spacing.lg },
  addButton: { marginBottom: spacing.lg },
  group: { marginBottom: spacing.lg },
  groupTitle: { ...typography.adminSectionHeader, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.adminBorder, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, gap: spacing.sm },
  rowLast: { borderBottomWidth: 0 },
  rowInactive: { opacity: 0.55 },
  rowInput: { flex: 1, height: 40, fontFamily: fonts.regular, fontSize: fontSizes.md, color: colors.textPrimary, paddingVertical: 0 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTag: { ...typography.badge, color: colors.textSecondary, backgroundColor: colors.modPendingBg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  footnote: { ...typography.label, textAlign: 'center' },
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.subheading },
  emptyCaption: { ...typography.caption, textAlign: 'center' },
  suggestion: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.adminBorder, padding: spacing.lg, marginBottom: spacing.sm },
  suggestionResolved: { opacity: 0.8 },
  suggestionLabel: { ...typography.bodyMedium },
  suggestionMeta: { ...typography.caption, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1, height: 44 },
  resolvedToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  resolvedToggleText: { ...typography.captionMedium },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.sm, ...shadows.floating },
  sheetTitle: { ...typography.subheading },
  sheetCaption: { ...typography.caption },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontFamily: fonts.regular, fontSize: fontSizes.md, color: colors.textPrimary },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  sheetButton: { marginTop: spacing.sm },
});

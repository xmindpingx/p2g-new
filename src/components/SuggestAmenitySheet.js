// places2go — SuggestAmenitySheet
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Bottom sheet for "Don't see it? Suggest one". Collects a label (≤ 40 chars)
// and a group, then calls submitCustomAmenity. Returns the submission so the
// caller can tag it on the place via customAmenityIds.

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, fonts, fontSizes } from '../theme';
import useStore from '../store/useStore';
import { AMENITY_GROUP_ORDER, AMENITY_GROUP_LABELS, CUSTOM_AMENITY_MAX_LABEL_LENGTH } from '../constants/amenities';
import { Chip } from './FilterChips';
import PrimaryButton from './PrimaryButton';

export default function SuggestAmenitySheet({ visible, initialGroup = null, placeId = null, onClose, onSubmitted }) {
  const insets              = useSafeAreaInsets();
  const submitCustomAmenity = useStore((s) => s.submitCustomAmenity);

  const [label, setLabel] = useState('');
  const [group, setGroup] = useState(initialGroup || AMENITY_GROUP_ORDER[0]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setLabel('');
      setGroup(initialGroup || AMENITY_GROUP_ORDER[0]);
      setError(null);
    }
  }, [visible, initialGroup]);

  const trimmed = label.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= CUSTOM_AMENITY_MAX_LABEL_LENGTH;

  const submit = () => {
    try {
      const submission = submitCustomAmenity({ label: trimmed, suggestedGroup: group, placeId });
      onSubmitted?.(submission);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Suggest an amenity</Text>
          <Text style={styles.caption}>
            A moderator will review it. If approved, it becomes available to everyone.
          </Text>

          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Hand sanitizer"
            placeholderTextColor={colors.placeholder}
            maxLength={CUSTOM_AMENITY_MAX_LABEL_LENGTH}
            autoFocus
            returnKeyType="done"
            style={styles.input}
            accessibilityLabel="Amenity name"
          />
          <Text style={styles.counter}>{trimmed.length} / {CUSTOM_AMENITY_MAX_LABEL_LENGTH}</Text>

          <Text style={styles.groupLabel}>Which section does it belong in?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groups} keyboardShouldPersistTaps="handled">
            {AMENITY_GROUP_ORDER.map((g) => (
              <Chip key={g} label={AMENITY_GROUP_LABELS[g]} active={group === g} onPress={() => setGroup(g)} />
            ))}
          </ScrollView>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label="Submit for review" onPress={submit} disabled={!canSubmit} style={styles.button} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor:      colors.surface,
    borderTopLeftRadius:  radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal:    spacing.lg,
    paddingTop:           spacing.sm,
    ...shadows.floating,
  },
  handle: {
    alignSelf:       'center',
    width:           40,
    height:          4,
    borderRadius:    radius.pill,
    backgroundColor: colors.border,
    marginBottom:    spacing.md,
  },
  title: {
    ...typography.subheading,
  },
  caption: {
    ...typography.caption,
    marginTop:    spacing.xs,
    marginBottom: spacing.lg,
  },
  input: {
    height:            48,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.background,
    paddingHorizontal: spacing.md,
    fontFamily:        fonts.regular,
    fontSize:          fontSizes.md,
    color:             colors.textPrimary,
  },
  counter: {
    ...typography.label,
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
  },
  groupLabel: {
    ...typography.captionMedium,
    marginTop:    spacing.md,
    marginBottom: spacing.sm,
  },
  groups: {
    gap: spacing.sm,
  },
  error: {
    ...typography.caption,
    color:     colors.primary,
    marginTop: spacing.sm,
  },
  button: {
    marginTop: spacing.lg,
  },
});

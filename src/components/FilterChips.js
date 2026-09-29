// places2go — FilterChips
// Horizontal, one-touch pill row. Active = Walnut fill / Ivory text.
// `leading` lets a screen prepend a special chip (e.g. the Sort chip on Results).

import React from 'react';
import { ScrollView, Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../theme';

export function Chip({ label, active = false, disabled = false, onPress, trailingIcon, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.chipActive : styles.chipInactive,
        disabled && styles.chipDisabled,
        pressed && !disabled && styles.chipPressed,
        style,
      ]}
    >
      <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
        {label}
      </Text>
      {trailingIcon ? (
        <Ionicons
          name={trailingIcon}
          size={14}
          color={active ? colors.chipActiveText : colors.chipInactiveText}
          style={styles.trailingIcon}
        />
      ) : null}
    </Pressable>
  );
}

export default function FilterChips({
  chips,
  activeKeys = [],
  onToggle,
  leading = null,
  style,
  contentContainerStyle,
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={style}
      contentContainerStyle={[styles.row, contentContainerStyle]}
    >
      {leading}
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          active={activeKeys.includes(chip.key)}
          disabled={chip.disabled === true}
          onPress={() => onToggle(chip.key)}
        />
      ))}
      <View style={styles.trailingSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    height:            36,
    paddingHorizontal: spacing.lg,
    borderRadius:      radius.pill,
    borderWidth:       1,
  },
  chipActive: {
    backgroundColor: colors.chipActiveBg,
    borderColor:     colors.chipActiveBg,
  },
  chipInactive: {
    backgroundColor: colors.surface,
    borderColor:     colors.chipInactiveBorder,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipPressed: {
    opacity: 0.8,
  },
  label: {
    ...typography.captionMedium,
  },
  labelActive: {
    color: colors.chipActiveText,
  },
  labelInactive: {
    color: colors.chipInactiveText,
  },
  trailingIcon: {
    marginLeft: spacing.xs,
  },
  trailingSpacer: {
    width: spacing.sm,
  },
});

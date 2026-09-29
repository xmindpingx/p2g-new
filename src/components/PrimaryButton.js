// places2go — PrimaryButton
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Full-width Walnut button used for every form submit (matches the wireframes'
// "Submit Place" / "Submit Review" / "Get Directions" buttons).

import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';

export default function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary', // 'primary' | 'secondary'
  textColor = null,    // optional override, e.g. Walnut text on a gold button
  style,
}) {
  const isDisabled = disabled || loading;
  const secondary  = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondary : styles.primary,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor || (secondary ? colors.primary : colors.textOnDark)} />
      ) : (
        <Text style={[styles.label, secondary && styles.labelSecondary, textColor ? { color: textColor } : null]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height:          52,
    borderRadius:    radius.md,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth:     1,
    borderColor:     colors.primary,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    ...typography.button,
  },
  labelSecondary: {
    color: colors.primary,
  },
});

// places2go — SkipIntroButton
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// The small "Skip" pill at the top centre of every beginning screen (Splash,
// Onboarding, Sign-in). Jumps straight to the map. Never signs anyone out.

import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius } from '../theme';

export default function SkipIntroButton({ onPress, label = 'Skip', light = false, style }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Skip to the map"
      style={({ pressed }) => [
        styles.pill,
        light ? styles.pillLight : styles.pillDark,
        { top: insets.top + spacing.sm },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.text, light ? styles.textLight : styles.textDark]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position:          'absolute',
    alignSelf:         'center',
    left:              '50%',
    transform:         [{ translateX: -32 }],
    minWidth:          64,
    height:            30,
    borderRadius:      radius.pill,
    paddingHorizontal: spacing.md,
    alignItems:        'center',
    justifyContent:    'center',
    zIndex:            10,
  },
  pillDark:  { backgroundColor: 'rgba(75, 46, 30, 0.08)' },
  pillLight: { backgroundColor: 'rgba(253, 251, 247, 0.18)' },
  pressed:   { opacity: 0.7 },
  text:      { ...typography.captionMedium },
  textDark:  { color: colors.textPrimary },
  textLight: { color: colors.textOnDark },
});

// places2go — HeadingArrow
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// An arrow that points from where the device is facing toward the destination.
// Rotation = bearing-to-place minus device heading, so "up" means straight
// ahead. When the device has no compass reading the arrow is replaced by the
// compass point of the bearing (e.g. "NE") so nothing is guessed.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '../theme';
import { bearingDegrees, relativeBearing, describeRelativeBearing, compassPoint } from '../utils/geo';

export default function HeadingArrow({ from, to, heading, size = 56, showLabel = true, labelOnly = false, style }) {
  const bearing = bearingDegrees(from, to);
  const diff    = relativeBearing(bearing, heading);
  const label   = diff !== null ? describeRelativeBearing(diff) : bearing !== null ? `Bearing ${compassPoint(bearing)}` : null;

  if (labelOnly) {
    return label ? <Text style={[styles.label, style]} accessibilityLabel={label}>{label}</Text> : null;
  }

  return (
    <View style={[styles.wrap, style]} accessibilityLabel={label || 'Direction unknown'}>
      <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
        {diff !== null ? (
          <Ionicons
            name="arrow-up"
            size={size * 0.55}
            color={colors.textOnDark}
            style={{ transform: [{ rotate: `${diff}deg` }] }}
          />
        ) : (
          <Text style={[styles.point, { fontSize: size * 0.32 }]}>{bearing !== null ? compassPoint(bearing) : '?'}</Text>
        )}
      </View>
      {showLabel && label ? <Text style={styles.label}>{label}</Text> : null}
      {showLabel && diff === null && bearing !== null ? <Text style={styles.sub}>No compass reading — showing direction</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { alignItems: 'center', gap: spacing.xs },
  disc:  { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  point: { ...typography.badge, color: colors.textOnDark },
  label: { ...typography.captionMedium, color: colors.textPrimary, textAlign: 'center' },
  sub:   { ...typography.label, textAlign: 'center' },
});

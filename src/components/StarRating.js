// places2go — StarRating (display only)
// Five Heritage Gold stars with half-star support. Interactive rating input
// lives in the Rate & Review screen (Phase 3), not here.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

const STAR_INDICES = [1, 2, 3, 4, 5];

function iconNameFor(rating, index) {
  const value = rating - (index - 1);
  if (value >= 0.75) return 'star';
  if (value >= 0.25) return 'star-half';
  return 'star-outline';
}

export default function StarRating({
  rating = 0,
  size = 14,
  color = colors.star,
  emptyColor = colors.starEmpty,
  gap = 2,
  style,
}) {
  const clamped = Math.max(0, Math.min(5, Number(rating) || 0));
  return (
    <View
      style={[styles.row, { gap }, style]}
      accessibilityRole="image"
      accessibilityLabel={`${clamped.toFixed(1)} out of 5 stars`}
    >
      {STAR_INDICES.map((index) => {
        const name = iconNameFor(clamped, index);
        return (
          <Ionicons
            key={index}
            name={name}
            size={size}
            color={name === 'star-outline' ? emptyColor : color}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
  },
});

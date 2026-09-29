// places2go — StarRatingInput
// Five large tappable Heritage Gold stars for the Rate & Review screen.

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';

const STARS = [1, 2, 3, 4, 5];

export default function StarRatingInput({ value = 0, onChange, size = 40, style }) {
  return (
    <View style={[styles.row, style]} accessibilityRole="radiogroup">
      {STARS.map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          hitSlop={6}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === n }}
          accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Ionicons
            name={n <= value ? 'star' : 'star-outline'}
            size={size}
            color={n <= value ? colors.star : colors.starEmpty}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            spacing.sm,
  },
  pressed: {
    transform: [{ scale: 0.9 }],
  },
});

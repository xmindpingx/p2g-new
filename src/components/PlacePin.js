// places2go — PlacePin
// Custom map marker: a teardrop with the brand "2" inside.
//   verified → Soft Sage   (community-verified place)
//   pending  → Slate       (newly added, not yet verified)
//   selected → Heritage Gold, rendered larger
//
// The teardrop is a square with three rounded corners rotated 45°, so the
// unrounded corner becomes the tip. The wrapper is sized to the rotated
// bounding box so the tip sits exactly at the bottom-centre; use
// Marker anchor={{ x: 0.5, y: 1 }} so the tip marks the coordinate.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';

export const PIN_VARIANTS = {
  VERIFIED: 'verified',
  PENDING:  'pending',
  SELECTED: 'selected',
};

const FILL = {
  [PIN_VARIANTS.VERIFIED]: colors.pinVerified,
  [PIN_VARIANTS.PENDING]:  colors.pinPending,
  [PIN_VARIANTS.SELECTED]: colors.pinSelected,
};

const SQRT2 = Math.SQRT2;

export default function PlacePin({ variant = PIN_VARIANTS.VERIFIED, size = 32 }) {
  const fill      = FILL[variant] || FILL[PIN_VARIANTS.VERIFIED];
  const textColor = variant === PIN_VARIANTS.SELECTED ? colors.textOnAccent : colors.textOnDark;
  const box       = Math.ceil(size * SQRT2);

  return (
    <View style={[styles.wrapper, { width: box, height: box }]} pointerEvents="none">
      <View
        style={[
          styles.drop,
          {
            width:        size,
            height:       size,
            borderRadius: size / 2,
            backgroundColor: fill,
          },
        ]}
      >
        <Text style={[styles.label, { color: textColor, fontSize: size * 0.5 }]}>2</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  drop: {
    alignItems:              'center',
    justifyContent:          'center',
    borderBottomRightRadius: 0,
    borderWidth:             2,
    borderColor:             colors.surface,
    transform:               [{ rotate: '45deg' }],
    shadowColor:             colors.primary,
    shadowOffset:            { width: 0, height: 2 },
    shadowOpacity:           0.25,
    shadowRadius:            3,
    elevation:               4,
  },
  label: {
    fontFamily: fonts.bold,
    transform:  [{ rotate: '-45deg' }],
    includeFontPadding: false,
    textAlign:  'center',
  },
});

// places2go — PlacePin
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Custom map marker: a teardrop with the brand "2" inside (or ✕ for an
// address with no public restroom). The fill colour follows the colour-coded
// scheme in utils/pinClass.js (black / red / orange / yellow / gold / silver /
// green / blue). A selected pin keeps its colour, renders larger, and gets a
// Walnut ring so the meaning of the colour is never lost.
//
// The teardrop is a square with three rounded corners rotated 45°, so the
// unrounded corner becomes the tip. The wrapper is sized to the rotated
// bounding box so the tip sits exactly at the bottom-centre; use
// Marker anchor={{ x: 0.5, y: 1 }} so the tip marks the coordinate.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, pinColors } from '../theme';
import { PIN_CLASS, pinColorFor } from '../utils/pinClass';

// Kept for older call sites (NavigationScreen fallback)
export const PIN_VARIANTS = {
  VERIFIED: 'verified',
  PENDING:  'pending',
  SELECTED: 'selected',
};

const LIGHT_TEXT_CLASSES = new Set([PIN_CLASS.LOW_RATED, PIN_CLASS.NICE, PIN_CLASS.BEST]);

const SQRT2 = Math.SQRT2;

export default function PlacePin({ pinClass = PIN_CLASS.NORMAL, selected = false, size = 32, variant = null }) {
  // Legacy variant support: selected → gold ring; otherwise blue/slate
  const fill = variant === PIN_VARIANTS.SELECTED ? pinColors.best
    : variant === PIN_VARIANTS.PENDING ? colors.pinPending
    : pinColorFor(pinClass);
  const noRestroom = pinClass === PIN_CLASS.NONE_ON_SITE || pinClass === PIN_CLASS.NOT_PUBLIC;
  const textColor  = LIGHT_TEXT_CLASSES.has(pinClass) || variant === PIN_VARIANTS.SELECTED ? colors.textOnAccent : colors.textOnDark;
  const glyph      = noRestroom ? '✕' : '2';
  const box        = Math.ceil(size * SQRT2);

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
            borderColor:  selected ? colors.primary : colors.surface,
            borderWidth:  selected ? 3 : 2,
          },
        ]}
      >
        <Text style={[styles.label, { color: textColor, fontSize: size * (noRestroom ? 0.42 : 0.5) }]}>{glyph}</Text>
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

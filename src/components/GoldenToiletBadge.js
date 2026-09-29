// places2go — GoldenToiletBadge
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// The brand's "Golden Toilet — Our Highest Rating" badge (assets/brand/
// golden-toilet.png, 315×75). Shown on the place that currently holds the
// BEST pin class (best rated near the user), nowhere else.

import React from 'react';
import { Image, StyleSheet } from 'react-native';

const SOURCE = require('../../assets/brand/golden-toilet.png');
const RATIO  = 315 / 75;

export default function GoldenToiletBadge({ height = 40, style }) {
  return (
    <Image
      source={SOURCE}
      style={[styles.image, { height, width: height * RATIO }, style]}
      resizeMode="contain"
      accessibilityLabel="Golden Toilet — our highest rating"
    />
  );
}

const styles = StyleSheet.create({ image: { borderRadius: 8 } });

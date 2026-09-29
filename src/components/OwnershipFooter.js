// places2go — OwnershipFooter
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Trademark / copyright / patent notice rendered from the Legal settings, so
// the owner can correct the wording in Admin Settings without a code change.

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { typography, spacing } from '../theme';
import useStore from '../store/useStore';
import { buildOwnershipNotice } from '../constants/legal';

export default function OwnershipFooter({ light = false, style }) {
  const appSettings = useStore((s) => s.appSettings);
  return (
    <Text style={[styles.text, light && styles.light, style]} accessibilityRole="text">
      {buildOwnershipNotice(appSettings)}
    </Text>
  );
}

const styles = StyleSheet.create({
  text:  { ...typography.label, textAlign: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  light: { color: 'rgba(253, 251, 247, 0.75)' },
});

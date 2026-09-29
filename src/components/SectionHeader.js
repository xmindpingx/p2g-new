// places2go — SectionHeader
// Form section label ("Add Photos (optional)", "Place Type", …) with an
// optional right-hand caption such as "3 / 10".

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography, spacing } from '../theme';

export default function SectionHeader({ title, caption = null, style }) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title}>{title}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'baseline',
    justifyContent: 'space-between',
    marginTop:      spacing.xl,
    marginBottom:   spacing.sm,
  },
  title: {
    ...typography.bodyMedium,
  },
  caption: {
    ...typography.label,
  },
});

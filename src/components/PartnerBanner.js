// places2go — PartnerBanner
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// The labelled courtesy notice a partner business can show on its listing and
// on the directions screen: a "Partner message" label, the courtesy line, an
// optional headline, and the items the business chose to suggest. Plain and
// clearly marked — no rewards, no tracking, no gamification.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../theme';

export default function PartnerBanner({ banner, compact = false, style }) {
  if (!banner) return null;
  const items = (banner.items || []).filter((i) => i.name);

  return (
    <View style={[styles.card, compact && styles.cardCompact, style]} accessibilityRole="summary" accessibilityLabel="Partner message">
      <View style={styles.labelRow}>
        <Ionicons name="storefront-outline" size={13} color={colors.partnerBannerLabel} />
        <Text style={styles.label}>PARTNER MESSAGE</Text>
      </View>

      {banner.courtesyMessage ? <Text style={styles.courtesy}>{banner.courtesyMessage}</Text> : null}
      {banner.headline ? <Text style={styles.headline}>{banner.headline}</Text> : null}

      {items.length > 0 ? (
        <View style={styles.items}>
          <Text style={styles.itemsTitle}>They suggest</Text>
          {items.map((item) => (
            <View key={item.id || item.name} style={styles.itemRow}>
              <Ionicons name="ellipse" size={5} color={colors.textSecondary} style={styles.bullet} />
              <Text style={styles.itemName}>{item.name}</Text>
              {item.price ? <Text style={styles.itemPrice}>{item.price}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.partnerBannerBg,
    borderColor:     colors.partnerBannerBorder,
    borderWidth:     1,
    borderRadius:    radius.md,
    padding:         spacing.lg,
    gap:             spacing.sm,
  },
  cardCompact: { padding: spacing.md, gap: spacing.xs },
  labelRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label:       { ...typography.badge, color: colors.partnerBannerLabel, letterSpacing: 0.8 },
  courtesy:    { ...typography.body },
  headline:    { ...typography.bodyMedium },
  items:       { marginTop: spacing.xs, gap: spacing.xs },
  itemsTitle:  { ...typography.label },
  itemRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bullet:      { marginLeft: 2 },
  itemName:    { ...typography.body, flex: 1 },
  itemPrice:   { ...typography.captionMedium, color: colors.textPrimary },
});

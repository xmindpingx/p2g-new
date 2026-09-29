// places2go — PresenceStatusCard
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Tells the user, in plain words, whether we can confirm they are at the
// address they are submitting — and what to do if we cannot (open location
// settings, move closer, wait for a fix).

import React from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius } from '../theme';
import { PRESENCE_CONFIRM, explainConfirmation } from '../hooks/useVisitEvidence';

const ICON = {
  [PRESENCE_CONFIRM.CONFIRMED]:     { name: 'checkmark-circle',       color: colors.modCleanText,    bg: colors.modCleanBg },
  [PRESENCE_CONFIRM.TOO_FAR]:       { name: 'walk-outline',           color: colors.modFlaggedText,  bg: colors.modFlaggedBg },
  [PRESENCE_CONFIRM.NO_PERMISSION]: { name: 'location-outline',       color: colors.modRejectedText, bg: colors.modRejectedBg },
  [PRESENCE_CONFIRM.SERVICES_OFF]:  { name: 'location-outline',       color: colors.modRejectedText, bg: colors.modRejectedBg },
  [PRESENCE_CONFIRM.ERROR]:         { name: 'alert-circle-outline',   color: colors.modRejectedText, bg: colors.modRejectedBg },
  [PRESENCE_CONFIRM.NO_TARGET]:     { name: 'search-outline',         color: colors.modPendingText,  bg: colors.modPendingBg },
  [PRESENCE_CONFIRM.WAITING]:       { name: 'time-outline',           color: colors.modPendingText,  bg: colors.modPendingBg },
};

export default function PresenceStatusCard({ confirmation, distanceM, radiusM, placeLabel, onRetry, style }) {
  const copy = explainConfirmation(confirmation, { distanceM, radiusM, placeLabel });
  const icon = ICON[confirmation] || ICON[PRESENCE_CONFIRM.WAITING];

  return (
    <View style={[styles.card, { backgroundColor: icon.bg }, style]} accessibilityRole="summary">
      <Ionicons name={icon.name} size={20} color={icon.color} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: icon.color }]}>{copy.title}</Text>
        <Text style={styles.message}>{copy.message}</Text>
        <View style={styles.actions}>
          {copy.showSettings ? (
            <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button" style={styles.action}>
              <Ionicons name="settings-outline" size={14} color={colors.primary} />
              <Text style={styles.actionText}>Check location settings</Text>
            </Pressable>
          ) : null}
          {onRetry && confirmation !== PRESENCE_CONFIRM.CONFIRMED && confirmation !== PRESENCE_CONFIRM.NO_TARGET ? (
            <Pressable onPress={onRetry} accessibilityRole="button" style={styles.action}>
              <Ionicons name="refresh-outline" size={14} color={colors.primary} />
              <Text style={styles.actionText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderRadius: radius.md, padding: spacing.md },
  text: { flex: 1, gap: 2 },
  title: { ...typography.captionMedium },
  message: { ...typography.caption, color: colors.textPrimary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionText: { ...typography.captionMedium, color: colors.primary },
});

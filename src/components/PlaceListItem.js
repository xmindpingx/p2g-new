// places2go — PlaceListItem
// One row of the Results list: initial avatar, name, "0.2 mi · Open",
// attribute summary, stars + review count, chevron.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../theme';
import { summarizeAttributes } from '../utils/places';
import StarRating from './StarRating';

export default function PlaceListItem({ place, distanceLabel = null, onPress }) {
  const rating     = place.rating || { average: 0, count: 0 };
  const attributes = summarizeAttributes(place, 2);
  const initial    = (place.name || '?').trim().charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}. Open details.`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
        {place.verified ? (
          <View style={styles.verifiedDot} accessibilityLabel="Verified">
            <Ionicons name="checkmark" size={9} color={colors.textOnDark} />
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{place.name}</Text>

        <Text style={styles.meta} numberOfLines={1}>
          {distanceLabel ? `${distanceLabel} · ` : ''}
          <Text style={place.isOpen ? styles.open : styles.closed}>
            {place.isOpen ? 'Open' : 'Closed'}
          </Text>
        </Text>

        {attributes.length > 0 ? (
          <Text style={styles.attributes} numberOfLines={1}>
            {attributes.join(' · ')}
          </Text>
        ) : null}

        <View style={styles.ratingRow}>
          <StarRating rating={rating.average} size={12} />
          <Text style={styles.count}>
            {rating.count > 0 ? `(${rating.count})` : 'No reviews yet'}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const AVATAR_SIZE = 44;

const styles = StyleSheet.create({
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    backgroundColor:   colors.background,
  },
  rowPressed: {
    backgroundColor: colors.surface,
  },
  avatar: {
    width:           AVATAR_SIZE,
    height:          AVATAR_SIZE,
    borderRadius:    AVATAR_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems:      'center',
    justifyContent:  'center',
    marginRight:     spacing.md,
  },
  avatarText: {
    ...typography.subheading,
    color: colors.textOnDark,
  },
  verifiedDot: {
    position:        'absolute',
    right:           -2,
    bottom:          -2,
    width:           16,
    height:          16,
    borderRadius:    radius.pill,
    backgroundColor: colors.success,
    borderWidth:     2,
    borderColor:     colors.background,
    alignItems:      'center',
    justifyContent:  'center',
  },
  content: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    ...typography.bodyMedium,
  },
  meta: {
    ...typography.caption,
    marginTop: 2,
  },
  open: {
    color: colors.success,
  },
  closed: {
    color: colors.textSecondary,
  },
  attributes: {
    ...typography.caption,
    marginTop: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginTop:     spacing.xs,
    gap:           spacing.xs + 2,
  },
  count: {
    ...typography.label,
  },
});

// places2go — PlaceCard
// The bottom card shown on the Map when a pin is selected:
// photo (or placeholder) with a gold rating badge, name, and the
// "0.3 mi · Open · Accessible" meta line. Tapping opens Place Details.

import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius, shadows } from '../theme';
import { isAccessiblePlace } from '../constants/filters';

const IMAGE_HEIGHT = 124;

export default function PlaceCard({ place, photoUri = null, distanceLabel = null, onPress, style }) {
  const rating     = place.rating || { average: 0, count: 0 };
  const accessible = isAccessiblePlace(place);

  const segments = [];
  if (distanceLabel) segments.push({ key: 'distance', text: distanceLabel });
  segments.push({
    key:   'open',
    text:  place.isOpen ? 'Open' : 'Closed',
    color: place.isOpen ? colors.success : colors.textSecondary,
  });
  if (accessible) segments.push({ key: 'accessible', text: 'Accessible', icon: 'accessibility' });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}. Open details.`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      <View style={styles.imageWrap}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={26} color={colors.textSecondary} />
            <Text style={styles.placeholderText}>No photos yet</Text>
          </View>
        )}
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={12} color={colors.textOnAccent} />
          <Text style={styles.ratingText}>
            {rating.count > 0 ? rating.average.toFixed(1) : 'New'}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{place.name}</Text>
        <View style={styles.metaRow}>
          {segments.map((segment, index) => (
            <React.Fragment key={segment.key}>
              {index > 0 ? <Text style={styles.metaDot}>·</Text> : null}
              <Text style={[styles.metaText, segment.color ? { color: segment.color } : null]}>
                {segment.text}
              </Text>
              {segment.icon ? (
                <Ionicons
                  name={segment.icon}
                  size={13}
                  color={colors.textPrimary}
                  style={styles.metaIcon}
                />
              ) : null}
            </React.Fragment>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    overflow:        'hidden',
    ...shadows.floating,
  },
  cardPressed: {
    opacity: 0.92,
  },
  imageWrap: {
    height: IMAGE_HEIGHT,
    backgroundColor: colors.background,
  },
  image: {
    width:  '100%',
    height: IMAGE_HEIGHT,
  },
  imagePlaceholder: {
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing.xs,
    backgroundColor: colors.background,
  },
  placeholderText: {
    ...typography.label,
  },
  ratingBadge: {
    position:          'absolute',
    top:               spacing.md,
    right:             spacing.md,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.xs,
    backgroundColor:   colors.accent,
    borderRadius:      radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical:   spacing.xs,
  },
  ratingText: {
    ...typography.captionMedium,
    color: colors.textOnAccent,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
  },
  name: {
    ...typography.subheading,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginTop:     spacing.xs,
  },
  metaText: {
    ...typography.caption,
  },
  metaDot: {
    ...typography.caption,
    marginHorizontal: spacing.xs + 2,
  },
  metaIcon: {
    marginLeft: spacing.xs,
  },
});

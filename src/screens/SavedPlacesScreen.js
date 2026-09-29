// places2go — SavedPlacesScreen (wireframe #10)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// The user's saved places as a simple list, with Edit mode to remove.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing } from '../theme';
import useStore from '../store/useStore';
import useUserLocation from '../hooks/useUserLocation';
import { ROUTES } from '../navigation/routes';
import { formatDistance } from '../utils/geo';
import { buildRatingIndex, decoratePlaces, listedPlaces } from '../utils/places';
import PlaceListItem from '../components/PlaceListItem';

export default function SavedPlacesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const places           = useStore((s) => s.places);
  const reviews          = useStore((s) => s.reviews);
  const savedPlaceIds    = useStore((s) => s.savedPlaceIds);
  const toggleSavedPlace = useStore((s) => s.toggleSavedPlace);
  const { location }     = useUserLocation();
  const [editing, setEditing] = useState(false);

  const currentUserId = useStore((s) => s.currentUser.id);
  const saved = useMemo(() => {
    const ratingIndex = buildRatingIndex(reviews);
    const byId = new Map(decoratePlaces(listedPlaces(places, currentUserId), { userLocation: location, ratingIndex }).map((p) => [p.id, p]));
    return savedPlaceIds.map((id) => byId.get(id)).filter(Boolean);
  }, [places, currentUserId, reviews, savedPlaceIds, location]);

  const renderItem = useCallback(({ item }) => (
    <View style={styles.row}>
      <View style={styles.rowItem}>
        <PlaceListItem
          place={item}
          distanceLabel={formatDistance(item.distanceMi)}
          onPress={() => navigation.navigate(ROUTES.PLACE_DETAILS, { placeId: item.id })}
        />
      </View>
      {editing ? (
        <Pressable onPress={() => toggleSavedPlace(item.id)} hitSlop={8} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`}>
          <Ionicons name="remove-circle" size={24} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  ), [editing, navigation, toggleSavedPlace]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Saved Places</Text>
        {saved.length > 0 ? (
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.edit}>{editing ? 'Done' : 'Edit'}</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={saved}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={saved.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>Nothing saved yet</Text>
            <Text style={styles.emptyCaption}>Tap the heart on any place to keep it here.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { ...typography.heading },
  edit: { ...typography.captionMedium, color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowItem: { flex: 1 },
  remove: { paddingRight: spacing.lg },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: spacing.lg + 44 + spacing.md },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.subheading },
  emptyCaption: { ...typography.caption, textAlign: 'center' },
});

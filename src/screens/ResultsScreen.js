// places2go — ResultsScreen (wireframe #4)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Back chevron + search field, then a chip row starting with "Sort ▾" and the
// shared filter chips, then the list of places. Shares query / chips / sort
// with the Map through useFilterStore, so switching views keeps state.

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Modal,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, shadows } from '../theme';
import useStore from '../store/useStore';
import useFilterStore from '../store/useFilterStore';
import useUserLocation from '../hooks/useUserLocation';
import { ROUTES } from '../navigation/routes';
import { FILTER_CHIPS, SORT_OPTIONS, SORT_OPTION_BY_KEY, SORT_KEYS } from '../constants/filters';
import { formatDistance } from '../utils/geo';
import { buildRatingIndex, decoratePlaces, filterPlaces, sortPlaces, listedPlaces } from '../utils/places';
import SearchBar from '../components/SearchBar';
import FilterChips, { Chip } from '../components/FilterChips';
import PlaceListItem from '../components/PlaceListItem';

// ---------------------------------------------------------------------------
// Sort bottom sheet
// ---------------------------------------------------------------------------
function SortSheet({ visible, selectedKey, hasLocation, onSelect, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close sort options" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Sort by</Text>
        {SORT_OPTIONS.map((option) => {
          const disabled = option.requiresLocation && !hasLocation;
          const selected = option.key === selectedKey;
          return (
            <Pressable
              key={option.key}
              disabled={disabled}
              onPress={() => onSelect(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              style={({ pressed }) => [
                styles.sheetRow,
                pressed && !disabled && styles.sheetRowPressed,
              ]}
            >
              <View style={styles.sheetRowText}>
                <Text style={[styles.sheetLabel, disabled && styles.sheetLabelDisabled]}>
                  {option.label}
                </Text>
                {disabled ? (
                  <Text style={styles.sheetCaption}>Location unavailable</Text>
                ) : null}
              </View>
              {selected ? (
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function ResultsScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const places   = useStore((s) => s.places);
  const reviews  = useStore((s) => s.reviews);

  const query          = useFilterStore((s) => s.query);
  const activeChipKeys = useFilterStore((s) => s.activeChipKeys);
  const sortKey        = useFilterStore((s) => s.sortKey);
  const setQuery       = useFilterStore((s) => s.setQuery);
  const toggleChip     = useFilterStore((s) => s.toggleChip);
  const setSortKey     = useFilterStore((s) => s.setSortKey);
  const clearFilters   = useFilterStore((s) => s.clearFilters);

  const { location } = useUserLocation();
  const hasLocation  = !!location;

  const [sortSheetVisible, setSortSheetVisible] = useState(false);

  // Distance sort needs a location; fall back to rating until one exists.
  const effectiveSortKey =
    sortKey === SORT_KEYS.DISTANCE && !hasLocation ? SORT_KEYS.RATING : sortKey;
  const activeSort = SORT_OPTION_BY_KEY[effectiveSortKey];

  // ── Derived data ──────────────────────────────────────────────────────────
  const ratingIndex = useMemo(() => buildRatingIndex(reviews), [reviews]);

  const currentUserId = useStore((s) => s.currentUser.id);
  const results = useMemo(() => {
    const decorated = decoratePlaces(listedPlaces(places, currentUserId), { userLocation: location, ratingIndex });
    const filtered  = filterPlaces(decorated, { activeChipKeys, query, userLocation: location });
    return sortPlaces(filtered, effectiveSortKey);
  }, [places, currentUserId, location, ratingIndex, activeChipKeys, query, effectiveSortKey]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleOpenPlace = useCallback(
    (placeId) => navigation.navigate(ROUTES.PLACE_DETAILS, { placeId }),
    [navigation],
  );

  const handleSelectSort = useCallback(
    (key) => {
      setSortKey(key);
      setSortSheetVisible(false);
    },
    [setSortKey],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <PlaceListItem
        place={item}
        distanceLabel={formatDistance(item.distanceMi)}
        onPress={() => handleOpenPlace(item.id)}
      />
    ),
    [handleOpenPlace],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const sortChip = (
    <Chip
      key="sort"
      label="Sort"
      trailingIcon="chevron-down"
      onPress={() => setSortSheetVisible(true)}
    />
  );

  const countLabel = `${results.length} ${results.length === 1 ? 'place' : 'places'} · ${activeSort.label}`;

  return (
    <View style={styles.container}>
      {/* Header: back + search */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to map"
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={Keyboard.dismiss}
          placeholder="Coffee, gas, food..."
          style={styles.searchBar}
        />
      </View>

      {/* Sort + filter chips */}
      <FilterChips
        chips={FILTER_CHIPS}
        activeKeys={activeChipKeys}
        onToggle={toggleChip}
        leading={sortChip}
        style={styles.chips}
        contentContainerStyle={styles.chipsContent}
      />

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={<Text style={styles.count}>{countLabel}</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={28} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No places match</Text>
            <Text style={styles.emptyCaption}>
              Try a different search or turn off a filter.
            </Text>
            <Pressable
              onPress={clearFilters}
              accessibilityRole="button"
              style={({ pressed }) => [styles.clearButton, pressed && styles.clearPressed]}
            >
              <Text style={styles.clearLabel}>Clear filters</Text>
            </Pressable>
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          results.length === 0 && styles.listContentEmpty,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />

      <SortSheet
        visible={sortSheetVisible}
        selectedKey={effectiveSortKey}
        hasLocation={hasLocation}
        onSelect={handleSelectSort}
        onClose={() => setSortSheetVisible(false)}
      />
    </View>
  );
}

const Separator = () => <View style={styles.separator} />;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.sm,
    backgroundColor:   colors.background,
  },
  backButton: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    spacing.xs,
  },
  searchBar: {
    flex: 1,
  },
  chips: {
    flexGrow: 0,
  },
  chipsContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.sm,
  },
  count: {
    ...typography.label,
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.sm,
    paddingBottom:     spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  separator: {
    height:           StyleSheet.hairlineWidth,
    backgroundColor:  colors.divider,
    marginLeft:       spacing.lg + 44 + spacing.md, // align under text, past the avatar
  },
  empty: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        spacing.xl,
    gap:            spacing.sm,
  },
  emptyTitle: {
    ...typography.subheading,
  },
  emptyCaption: {
    ...typography.caption,
    textAlign: 'center',
  },
  clearButton: {
    marginTop:         spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.pill,
    backgroundColor:   colors.primary,
  },
  clearPressed: {
    opacity: 0.85,
  },
  clearLabel: {
    ...typography.button,
  },

  // Sort sheet
  backdrop: {
    flex:            1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor:      colors.surface,
    borderTopLeftRadius:  radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal:    spacing.lg,
    paddingTop:           spacing.sm,
    ...shadows.floating,
  },
  sheetHandle: {
    alignSelf:       'center',
    width:           40,
    height:          4,
    borderRadius:    radius.pill,
    backgroundColor: colors.border,
    marginBottom:    spacing.md,
  },
  sheetTitle: {
    ...typography.subheading,
    marginBottom: spacing.sm,
  },
  sheetRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  sheetRowPressed: {
    opacity: 0.7,
  },
  sheetRowText: {
    flex: 1,
  },
  sheetLabel: {
    ...typography.body,
  },
  sheetLabelDisabled: {
    color: colors.textSecondary,
  },
  sheetCaption: {
    ...typography.label,
    marginTop: 2,
  },
});

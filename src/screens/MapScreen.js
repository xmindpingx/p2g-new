// places2go — MapScreen (wireframe #3)
// Full-bleed map with a floating search field, one-touch filter chips, custom
// "2" pins, the user's blue dot, a List button, a Locate button, and a bottom
// PlaceCard when a pin is selected.
//
// Search behaviour:
//   • Typing filters the pins by name / address / type instantly.
//   • Submitting with matching pins fits the map to them.
//   • Submitting with no matching pins geocodes the text with Nominatim and
//     moves the map there (the "Nearby" radius chip is switched off so the
//     new area is not filtered out).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Keyboard, Linking } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, shadows } from '../theme';
import useStore from '../store/useStore';
import useFilterStore from '../store/useFilterStore';
import useUserLocation, { LOCATION_STATUS } from '../hooks/useUserLocation';
import { ROUTES } from '../navigation/routes';
import { FILTER_CHIPS, CHIP_KEYS } from '../constants/filters';
import { searchAddress } from '../services/nominatim';
import { regionAround, regionFromCoords, formatDistance, WORLD_REGION } from '../utils/geo';
import { buildRatingIndex, decoratePlaces, filterPlaces, primaryPhotoUri } from '../utils/places';
import SearchBar from '../components/SearchBar';
import FilterChips from '../components/FilterChips';
import PlaceCard from '../components/PlaceCard';
import PlacePin, { PIN_VARIANTS } from '../components/PlacePin';

const SEARCH_STATUS = {
  IDLE:      'idle',
  SEARCHING: 'searching',
  NOT_FOUND: 'notFound',
  ERROR:     'error',
};

const PIN_SIZE          = 32;
const PIN_SIZE_SELECTED = 40;

// ---------------------------------------------------------------------------
// Marker — memoised so only the selected/deselected pins re-render.
// tracksViewChanges is briefly enabled after each variant change so the custom
// view is captured, then disabled again for performance.
// ---------------------------------------------------------------------------
const PlaceMarker = React.memo(function PlaceMarker({ place, selected, onPress }) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), 400);
    return () => clearTimeout(timer);
  }, [selected]);

  const variant = selected
    ? PIN_VARIANTS.SELECTED
    : place.verified
      ? PIN_VARIANTS.VERIFIED
      : PIN_VARIANTS.PENDING;

  return (
    <Marker
      coordinate={{ latitude: place.latitude, longitude: place.longitude }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracksViewChanges}
      zIndex={selected ? 10 : 1}
      accessibilityLabel={place.name}
      onPress={(event) => {
        if (event?.stopPropagation) event.stopPropagation();
        onPress(place.id);
      }}
    >
      <PlacePin variant={variant} size={selected ? PIN_SIZE_SELECTED : PIN_SIZE} />
    </Marker>
  );
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function MapScreen({ navigation }) {
  const mapRef = useRef(null);
  const insets = useSafeAreaInsets();

  // Store data
  const places          = useStore((s) => s.places);
  const reviews         = useStore((s) => s.reviews);
  const moderationQueue = useStore((s) => s.moderationQueue);
  const appSettings     = useStore((s) => s.appSettings);

  // Shared filter state
  const query           = useFilterStore((s) => s.query);
  const activeChipKeys  = useFilterStore((s) => s.activeChipKeys);
  const selectedPlaceId = useFilterStore((s) => s.selectedPlaceId);
  const setQuery        = useFilterStore((s) => s.setQuery);
  const toggleChip      = useFilterStore((s) => s.toggleChip);
  const setChipActive   = useFilterStore((s) => s.setChipActive);
  const selectPlace     = useFilterStore((s) => s.selectPlace);

  // Device location
  const {
    location,
    status: locationStatus,
    canAskAgain,
    refresh: refreshLocation,
  } = useUserLocation();

  // Local UI state
  const [searchStatus, setSearchStatus]     = useState(SEARCH_STATUS.IDLE);
  const [areaQuery, setAreaQuery]           = useState(null); // query last used to move the map
  const [cardHeight, setCardHeight]         = useState(0);
  const [overlayHeight, setOverlayHeight]   = useState(0);
  const centeredOnUserRef                   = useRef(false);

  // ── Derived data ──────────────────────────────────────────────────────────
  const ratingIndex = useMemo(() => buildRatingIndex(reviews), [reviews]);

  const decoratedPlaces = useMemo(
    () => decoratePlaces(places, { userLocation: location, ratingIndex }),
    [places, location, ratingIndex],
  );

  // Once a query has been used to move the map to an area, stop using that
  // same text to filter pins by name; typing anything new re-enables filtering.
  const effectiveQuery = query.trim() === areaQuery ? '' : query;

  const visiblePlaces = useMemo(
    () =>
      filterPlaces(decoratedPlaces, {
        activeChipKeys,
        query: effectiveQuery,
        userLocation: location,
      }),
    [decoratedPlaces, activeChipKeys, effectiveQuery, location],
  );

  const selectedPlace = useMemo(
    () => visiblePlaces.find((p) => p.id === selectedPlaceId) || null,
    [visiblePlaces, selectedPlaceId],
  );

  // Initial region is computed once from whatever data exists at mount.
  const initialRegion = useMemo(
    () => regionFromCoords(places) || WORLD_REGION,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Effects ───────────────────────────────────────────────────────────────
  // Centre on the user the first time a location arrives.
  useEffect(() => {
    if (location && !centeredOnUserRef.current && mapRef.current) {
      centeredOnUserRef.current = true;
      mapRef.current.animateToRegion(regionAround(location, 2), 600);
    }
  }, [location]);

  // Reset search feedback whenever the text changes.
  useEffect(() => {
    setSearchStatus(SEARCH_STATUS.IDLE);
  }, [query]);

  // Deselect a pin that has been filtered out.
  useEffect(() => {
    if (selectedPlaceId && !selectedPlace) selectPlace(null);
  }, [selectedPlaceId, selectedPlace, selectPlace]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const fitToPlaces = useCallback((list) => {
    if (!mapRef.current || list.length === 0) return;
    const region = regionFromCoords(list);
    if (region) mapRef.current.animateToRegion(region, 500);
  }, []);

  const handleSubmitSearch = useCallback(async () => {
    Keyboard.dismiss();
    const q = query.trim();
    if (!q) return;

    // Matching pins exist → show them.
    if (visiblePlaces.length > 0 && effectiveQuery) {
      fitToPlaces(visiblePlaces);
      return;
    }

    // No matching pins → treat the text as an area / address and geocode it.
    setSearchStatus(SEARCH_STATUS.SEARCHING);
    try {
      const results = await searchAddress(q, { limit: 1, near: location });
      if (results.length === 0) {
        setSearchStatus(SEARCH_STATUS.NOT_FOUND);
        return;
      }
      const target = results[0];
      setAreaQuery(q);
      setChipActive(CHIP_KEYS.NEARBY, false);
      setSearchStatus(SEARCH_STATUS.IDLE);
      selectPlace(null);
      mapRef.current?.animateToRegion(regionAround(target, 1.5), 600);
    } catch (err) {
      setSearchStatus(SEARCH_STATUS.ERROR);
    }
  }, [query, effectiveQuery, visiblePlaces, location, fitToPlaces, setChipActive, selectPlace]);

  const handleMarkerPress = useCallback((placeId) => {
    selectPlace(placeId);
  }, [selectPlace]);

  const handleMapPress = useCallback(() => {
    Keyboard.dismiss();
    if (selectedPlaceId) selectPlace(null);
  }, [selectedPlaceId, selectPlace]);

  const handleCardPress = useCallback(() => {
    if (!selectedPlace) return;
    navigation.navigate(ROUTES.PLACE_DETAILS, { placeId: selectedPlace.id });
  }, [navigation, selectedPlace]);

  const handleListPress = useCallback(() => {
    navigation.navigate(ROUTES.RESULTS);
  }, [navigation]);

  const handleLocatePress = useCallback(() => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(regionAround(location, 1), 500);
      return;
    }
    if (locationStatus === LOCATION_STATUS.DENIED && !canAskAgain) {
      Linking.openSettings();
      return;
    }
    refreshLocation();
  }, [location, locationStatus, canAskAgain, refreshLocation]);

  // ── Status messages ───────────────────────────────────────────────────────
  let statusMessage = null;
  if (searchStatus === SEARCH_STATUS.SEARCHING) {
    statusMessage = 'Searching…';
  } else if (searchStatus === SEARCH_STATUS.NOT_FOUND) {
    statusMessage = `No results for "${query.trim()}"`;
  } else if (searchStatus === SEARCH_STATUS.ERROR) {
    statusMessage = "Couldn't reach the address service. Check your connection.";
  } else if (locationStatus === LOCATION_STATUS.DENIED) {
    statusMessage = 'Location is off — distances are hidden.';
  } else if (locationStatus === LOCATION_STATUS.UNAVAILABLE) {
    statusMessage = 'Turn on location services to see distances.';
  }

  const showEmptyPill = visiblePlaces.length === 0 && searchStatus === SEARCH_STATUS.IDLE;

  const floatingBottom =
    selectedPlace && cardHeight > 0
      ? cardHeight + spacing.lg + spacing.md
      : spacing.lg;

  const cardPhotoUri = selectedPlace
    ? primaryPhotoUri(selectedPlace, moderationQueue, appSettings)
    : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation={locationStatus === LOCATION_STATUS.GRANTED}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        onPress={handleMapPress}
        mapPadding={{ top: overlayHeight, bottom: floatingBottom, left: 0, right: 0 }}
      >
        {visiblePlaces.map((place) => (
          <PlaceMarker
            key={place.id}
            place={place}
            selected={place.id === selectedPlaceId}
            onPress={handleMarkerPress}
          />
        ))}
      </MapView>

      {/* Top overlay: search + chips + status */}
      <View
        style={[styles.topOverlay, { paddingTop: insets.top + spacing.sm }]}
        pointerEvents="box-none"
        onLayout={(e) => setOverlayHeight(e.nativeEvent.layout.height)}
      >
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={handleSubmitSearch}
          placeholder="Search for a place..."
          style={styles.searchBar}
        />
        <FilterChips
          chips={FILTER_CHIPS}
          activeKeys={activeChipKeys}
          onToggle={toggleChip}
          contentContainerStyle={styles.chipsContent}
        />
        {statusMessage ? (
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        ) : null}
      </View>

      {/* Empty state */}
      {showEmptyPill ? (
        <View style={[styles.emptyPill, { bottom: floatingBottom + 52 + spacing.md }]}>
          <Text style={styles.emptyText}>No places match these filters</Text>
        </View>
      ) : null}

      {/* Floating buttons */}
      <View style={[styles.floatingLeft, { bottom: floatingBottom }]}>
        <Pressable
          onPress={handleListPress}
          accessibilityRole="button"
          accessibilityLabel="Show list view"
          style={({ pressed }) => [styles.floatingButton, pressed && styles.floatingPressed]}
        >
          <Ionicons name="list" size={20} color={colors.textPrimary} />
          <Text style={styles.floatingLabel}>List</Text>
        </Pressable>
      </View>

      <View style={[styles.floatingRight, { bottom: floatingBottom }]}>
        <Pressable
          onPress={handleLocatePress}
          accessibilityRole="button"
          accessibilityLabel="Centre map on my location"
          style={({ pressed }) => [styles.floatingRound, pressed && styles.floatingPressed]}
        >
          <Ionicons
            name={location ? 'navigate' : 'navigate-outline'}
            size={20}
            color={colors.textPrimary}
          />
        </Pressable>
      </View>

      {/* Selected place card */}
      {selectedPlace ? (
        <View
          style={styles.cardWrap}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <PlaceCard
            place={selectedPlace}
            photoUri={cardPhotoUri}
            distanceLabel={formatDistance(selectedPlace.distanceMi)}
            onPress={handleCardPress}
          />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.background,
  },
  topOverlay: {
    position: 'absolute',
    top:      0,
    left:     0,
    right:    0,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    marginHorizontal: spacing.lg,
  },
  chipsContent: {
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.md,
  },
  statusPill: {
    alignSelf:         'center',
    marginTop:         spacing.sm,
    backgroundColor:   colors.surface,
    borderRadius:      radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs + 2,
    ...shadows.card,
  },
  statusText: {
    ...typography.caption,
  },
  emptyPill: {
    position:          'absolute',
    alignSelf:         'center',
    backgroundColor:   colors.surface,
    borderRadius:      radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.sm,
    ...shadows.card,
  },
  emptyText: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  floatingLeft: {
    position: 'absolute',
    left:     spacing.lg,
  },
  floatingRight: {
    position: 'absolute',
    right:    spacing.lg,
  },
  floatingButton: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.xs + 2,
    height:            44,
    paddingHorizontal: spacing.lg,
    borderRadius:      radius.pill,
    backgroundColor:   colors.surface,
    ...shadows.floating,
  },
  floatingLabel: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  floatingRound: {
    width:           44,
    height:          44,
    borderRadius:    radius.pill,
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
    ...shadows.floating,
  },
  floatingPressed: {
    opacity: 0.85,
  },
  cardWrap: {
    position: 'absolute',
    left:     spacing.lg,
    right:    spacing.lg,
    bottom:   spacing.lg,
  },
});

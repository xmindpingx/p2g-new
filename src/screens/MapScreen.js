// places2go — MapScreen (wireframe #3)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
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
import { View, Text, Pressable, StyleSheet, Keyboard, Linking, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import MapView, { Marker } from '../native/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, shadows } from '../theme';
import useStore from '../store/useStore';
import { selectDebugLocation } from '../utils/debugLocation';
import useFilterStore from '../store/useFilterStore';
import useUserLocation, { LOCATION_STATUS } from '../hooks/useUserLocation';
import useHeading from '../hooks/useHeading';
import useLiveMap from '../hooks/useLiveMap';
import useVoiceAssistant from '../hooks/useVoiceAssistant';
import { ROUTES } from '../navigation/routes';
import { FILTER_CHIPS, CHIP_KEYS } from '../constants/filters';
import { searchAddress } from '../services/nominatim';
import { regionAround, regionFromCoords, formatDistance, distanceMeters, WORLD_REGION } from '../utils/geo';
import { buildRatingIndex, decoratePlaces, filterPlaces, primaryPhotoUri, listedPlaces } from '../utils/places';
import SearchBar from '../components/SearchBar';
import FilterChips from '../components/FilterChips';
import PlaceCard from '../components/PlaceCard';
import PlacePin from '../components/PlacePin';
import { buildPinClassIndex, PIN_CLASS_ORDER, PIN_CLASS_LABELS, pinColorFor, PIN_CLASS } from '../utils/pinClass';
import HeadingArrow from '../components/HeadingArrow';
import HandsFreeSheet from '../components/HandsFreeSheet';

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
const PlaceMarker = React.memo(function PlaceMarker({ place, pinClass, selected, onPress }) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), 400);
    return () => clearTimeout(timer);
  }, [selected, pinClass]);

  return (
    <Marker
      coordinate={{ latitude: place.latitude, longitude: place.longitude }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracksViewChanges}
      zIndex={selected ? 10 : pinClass === PIN_CLASS.BEST ? 5 : 1}
      accessibilityLabel={`${place.name}. ${PIN_CLASS_LABELS[pinClass] || ''}`}
      onPress={(event) => {
        if (event?.stopPropagation) event.stopPropagation();
        onPress(place.id);
      }}
    >
      <PlacePin pinClass={pinClass} selected={selected} size={selected ? PIN_SIZE_SELECTED : PIN_SIZE} />
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
  const allPlaces       = useStore((s) => s.places);
  const reviews         = useStore((s) => s.reviews);
  const moderationQueue = useStore((s) => s.moderationQueue);
  const appSettings     = useStore((s) => s.appSettings);
  const currentUser     = useStore((s) => s.currentUser);
  // Reports an admin could not verify are hidden from everyone but their contributor
  const places = useMemo(() => listedPlaces(allPlaces, currentUser.id), [allPlaces, currentUser.id]);

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
  } = useUserLocation({ watch: true });
  const { heading } = useHeading({ active: true });

  // Admin test location (right-click the web map). Never shared to the live map.
  const debugLoc      = useStore(selectDebugLocation);
  const isAdmin       = useStore((s) => s.currentUser.role === 'admin');
  const fakeAllowed   = useStore((s) => !!s.appSettings.adminFakeLocationEnabled);
  const setDebugLocation = useStore((s) => s.setDebugLocation);
  const { width: screenWidth } = useWindowDimensions();
  const [menu, setMenu] = useState(null); // { coordinate, point }
  const canFake = isAdmin && fakeAllowed;
  const liveMap     = useLiveMap({ location: debugLoc ? null : location, active: true });

  // Local UI state
  const [searchStatus, setSearchStatus]     = useState(SEARCH_STATUS.IDLE);
  const [areaQuery, setAreaQuery]           = useState(null); // query last used to move the map
  const [cardHeight, setCardHeight]         = useState(0);
  const [overlayHeight, setOverlayHeight]   = useState(0);
  const [voiceOpen, setVoiceOpen]           = useState(false);
  const [legendOpen, setLegendOpen]         = useState(false);
  const centeredOnUserRef                   = useRef(false);

  // ── Derived data ──────────────────────────────────────────────────────────
  const ratingIndex = useMemo(() => buildRatingIndex(reviews), [reviews]);

  // Colour class per pin (gold = best-rated within the admin radius of the user)
  const pinClassIndex = useMemo(
    () => buildPinClassIndex(places, { reviews, ratingIndex, userLocation: location, settings: appSettings }),
    [places, reviews, ratingIndex, location?.latitude, location?.longitude, appSettings], // eslint-disable-line react-hooks/exhaustive-deps
  );

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

  const handleDirections = useCallback((place, mode) => {
    setVoiceOpen(false);
    navigation.navigate(ROUTES.NAVIGATION, { placeId: place.id, mode });
  }, [navigation]);

  const assistant = useVoiceAssistant({ userLocation: location, onDirections: handleDirections });

  const handleVoiceOpenPlace = useCallback((place) => {
    setVoiceOpen(false);
    selectPlace(place.id);
    navigation.navigate(ROUTES.PLACE_DETAILS, { placeId: place.id });
  }, [navigation, selectPlace]);

  // Approach mode: when the selected place is within range, show the arrow + live distance
  const selectedMeters = selectedPlace && location ? distanceMeters(location, selectedPlace) : null;
  const approaching    = Number.isFinite(selectedMeters) && selectedMeters <= appSettings.approachAlertMeters;

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
        onPress={(e) => { setMenu(null); handleMapPress(e); }}
        onContextMenu={canFake ? setMenu : undefined}
        userLocationOverride={debugLoc}
        mapPadding={{ top: overlayHeight, bottom: floatingBottom, left: 0, right: 0 }}
      >
        {visiblePlaces.map((place) => (
          <PlaceMarker
            key={place.id}
            place={place}
            pinClass={pinClassIndex[place.id] || PIN_CLASS.NORMAL}
            selected={place.id === selectedPlaceId}
            onPress={handleMarkerPress}
          />
        ))}
        {liveMap.others.map((u) => (
          <Marker
            key={u.id}
            coordinate={{ latitude: u.lat, longitude: u.lon }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={0}
            accessibilityLabel="Another places2go user sharing their location"
          >
            <View style={styles.liveDot} />
          </Marker>
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
      {debugLoc ? (
        <Pressable onPress={() => setDebugLocation(null)} accessibilityRole="button" accessibilityLabel="Clear test location" style={[styles.testBanner, { top: overlayHeight + spacing.sm }]}>
          <Ionicons name="location" size={14} color={colors.textOnAccent} />
          <Text style={styles.testBannerText}>Test location {debugLoc.latitude.toFixed(4)}, {debugLoc.longitude.toFixed(4)} · tap to clear</Text>
        </Pressable>
      ) : null}

      {menu ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} accessibilityLabel="Close menu" />
          <View style={[styles.ctxMenu, { left: Math.max(8, Math.min(menu.point.x, screenWidth - 258)), top: menu.point.y }]}>
            <Text style={styles.ctxTitle}>{menu.coordinate.latitude.toFixed(5)}, {menu.coordinate.longitude.toFixed(5)}</Text>
            <Pressable style={styles.ctxItem} accessibilityRole="button" onPress={() => {
              try { setDebugLocation(menu.coordinate); mapRef.current?.animateToRegion(regionAround(menu.coordinate, 1), 500); } catch (err) { /* setting off or not admin */ }
              setMenu(null);
            }}>
              <Ionicons name="navigate-outline" size={16} color={colors.textPrimary} /><Text style={styles.ctxText}>Set my location here (test)</Text>
            </Pressable>
            {debugLoc ? (
              <Pressable style={styles.ctxItem} accessibilityRole="button" onPress={() => { setDebugLocation(null); setMenu(null); }}>
                <Ionicons name="close-circle-outline" size={16} color={colors.textPrimary} /><Text style={styles.ctxText}>Clear test location</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.ctxItem} accessibilityRole="button" onPress={() => { Clipboard.setStringAsync(`${menu.coordinate.latitude}, ${menu.coordinate.longitude}`).catch(() => {}); setMenu(null); }}>
              <Ionicons name="copy-outline" size={16} color={colors.textPrimary} /><Text style={styles.ctxText}>Copy coordinates</Text>
            </Pressable>
          </View>
        </>
      ) : null}

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
        <Pressable
          onPress={() => setLegendOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Pin colour legend"
          style={({ pressed }) => [styles.floatingRound, styles.legendButton, pressed && styles.floatingPressed]}
        >
          <Ionicons name={legendOpen ? 'close' : 'color-palette-outline'} size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {legendOpen ? (
        <View style={[styles.legend, { bottom: floatingBottom + 52 + spacing.md }]} accessibilityRole="summary">
          {PIN_CLASS_ORDER.map((k) => (
            <View key={k} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: pinColorFor(k) }]} />
              <Text style={styles.legendText}>
                {PIN_CLASS_LABELS[k]}{k === PIN_CLASS.BEST ? ` (within ${appSettings.pinBestRadiusMiles} mi)` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.floatingRight, { bottom: floatingBottom }]}>
        {appSettings.handsFreeEnabled ? (
          <Pressable
            onPress={() => setVoiceOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Hands-free search"
            style={({ pressed }) => [styles.floatingRound, styles.micButton, pressed && styles.floatingPressed]}
          >
            <Ionicons name="mic" size={20} color={colors.textOnDark} />
          </Pressable>
        ) : null}
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

      {/* Selected place card (+ approach arrow when close) */}
      {selectedPlace ? (
        <View
          style={styles.cardWrap}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          {approaching ? (
            <View style={styles.approach}>
              <HeadingArrow from={location} to={selectedPlace} heading={heading} size={44} showLabel={false} />
              <View style={styles.approachText}>
                <Text style={styles.approachDistance}>
                  {selectedMeters <= 25 ? "You're here" : `${Math.round(selectedMeters)} m away`}
                </Text>
                <HeadingArrow from={location} to={selectedPlace} heading={heading} labelOnly style={styles.approachLabel} />
              </View>
              <View style={styles.approachButtons}>
                <Pressable onPress={() => handleDirections(selectedPlace, 'walking')} accessibilityRole="button" accessibilityLabel="Walking directions" style={styles.approachButton}>
                  <Ionicons name="walk-outline" size={18} color={colors.textPrimary} />
                </Pressable>
                <Pressable onPress={() => handleDirections(selectedPlace, 'driving')} accessibilityRole="button" accessibilityLabel="Driving directions" style={styles.approachButton}>
                  <Ionicons name="car-outline" size={18} color={colors.textPrimary} />
                </Pressable>
              </View>
            </View>
          ) : null}
          <PlaceCard
            place={selectedPlace}
            photoUri={cardPhotoUri}
            distanceLabel={formatDistance(selectedPlace.distanceMi)}
            onPress={handleCardPress}
          />
        </View>
      ) : null}

      <HandsFreeSheet
        visible={voiceOpen}
        assistant={assistant}
        onClose={() => { setVoiceOpen(false); assistant.reset(); }}
        onOpenPlace={handleVoiceOpenPlace}
        onDirections={handleDirections}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  testBanner: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, zIndex: 50, ...shadows.card },
  testBannerText: { ...typography.badge, color: colors.textOnAccent },
  ctxMenu: { position: 'absolute', width: 250, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.xs, zIndex: 60, ...shadows.floating },
  ctxTitle: { ...typography.label, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  ctxItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  ctxText: { ...typography.body },
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
    position:   'absolute',
    left:       spacing.lg,
    alignItems: 'flex-start',
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
    gap:      spacing.sm,
  },
  micButton: {
    backgroundColor: colors.primary,
    marginBottom:    spacing.sm,
  },
  legendButton: {
    marginTop: spacing.sm,
  },
  legend: {
    position:        'absolute',
    left:            spacing.lg,
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    padding:         spacing.md,
    gap:             spacing.xs,
    ...shadows.floating,
  },
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot:  { width: 12, height: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  legendText: { ...typography.caption, color: colors.textPrimary },
  liveDot: {
    width:           14,
    height:          14,
    borderRadius:    radius.pill,
    backgroundColor: colors.success,
    borderWidth:     2,
    borderColor:     colors.surface,
    opacity:         0.9,
  },
  approach: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.md,
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    ...shadows.floating,
  },
  approachText:     { flex: 1 },
  approachDistance: { ...typography.subheading },
  approachLabel:    { textAlign: 'left' },
  approachButtons:  { flexDirection: 'row', gap: spacing.sm },
  approachButton:   { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});

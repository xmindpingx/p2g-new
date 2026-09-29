// places2go — NavigationScreen (wireframe #6)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Walking or driving directions drawn on the map from an OSRM server
// (OpenStreetMap data): the route line, the server's distance and duration,
// and the step list. A compass arrow shows whether you are heading toward the
// place and the distance updates live as you move. "Open in Maps" hands off to
// Apple/Google Maps for turn-by-turn voice guidance.
//
// When routing is off or the server cannot be reached, the screen falls back
// to a straight line and says "straight-line" so nobody mistakes it for a
// road distance. Nothing shown here is estimated by the app.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, Linking, ScrollView, StyleSheet } from 'react-native';
import { showAlert } from '../utils/alert';
import MapView, { Marker, Polyline } from '../native/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, shadows } from '../theme';
import useStore from '../store/useStore';
import useUserLocation from '../hooks/useUserLocation';
import useHeading from '../hooks/useHeading';
import { distanceMiles, distanceMeters, formatDistance, regionAround, regionFromCoords } from '../utils/geo';
import { fetchRoute, isRoutingConfigured, isPublicDemoRouter, ROUTE_MODES, formatDuration, formatMeters } from '../services/routing';
import { getActivePlaceBanner } from '../utils/cobranding';
import PlacePin from '../components/PlacePin';
import { buildPinClassIndex, PIN_CLASS } from '../utils/pinClass';
import { buildRatingIndex } from '../utils/places';
import PrimaryButton from '../components/PrimaryButton';
import HeadingArrow from '../components/HeadingArrow';
import PartnerBanner from '../components/PartnerBanner';

const MODES = [
  { key: ROUTE_MODES.WALKING, label: 'Walk',  icon: 'walk-outline' },
  { key: ROUTE_MODES.DRIVING, label: 'Drive', icon: 'car-outline' },
];

const ARRIVED_METERS = 25;

function buildMapsUrl({ latitude, longitude, name, mode }) {
  const label = encodeURIComponent(name || 'Destination');
  const flag  = mode === ROUTE_MODES.WALKING ? 'w' : 'd';
  if (Platform.OS === 'ios') return `maps://?daddr=${latitude},${longitude}&q=${label}&dirflg=${flag}`;
  return `google.navigation:q=${latitude},${longitude}&mode=${flag}`;
}

function buildWebFallback({ latitude, longitude, mode }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=${mode}`;
}

export default function NavigationScreen({ navigation, route }) {
  const insets  = useSafeAreaInsets();
  const mapRef  = useRef(null);
  const placeId = route.params?.placeId;
  const initialMode = route.params?.mode === ROUTE_MODES.DRIVING ? ROUTE_MODES.DRIVING : ROUTE_MODES.WALKING;

  const place       = useStore((s) => s.places.find((p) => p.id === placeId) || null);
  const appSettings = useStore((s) => s.appSettings);
  const profile     = useStore((s) => s.coBranding[placeId] || null);
  const allPlaces   = useStore((s) => s.places);
  const reviews     = useStore((s) => s.reviews);

  const { location } = useUserLocation({ watch: true });

  const pinClass = useMemo(() => {
    if (!place) return PIN_CLASS.NORMAL;
    const idx = buildPinClassIndex(allPlaces, { reviews, ratingIndex: buildRatingIndex(reviews), userLocation: location, settings: appSettings });
    return idx[place.id] || PIN_CLASS.NORMAL;
  }, [place, allPlaces, reviews, location?.latitude, location?.longitude, appSettings]); // eslint-disable-line react-hooks/exhaustive-deps
  const { heading }  = useHeading({ active: true });

  const [mode, setMode]         = useState(initialMode);
  const [routeData, setRoute]   = useState(null);
  const [routeError, setRouteError] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const routeOriginRef = useRef(null);

  const banner  = useMemo(() => getActivePlaceBanner(profile, appSettings), [profile, appSettings]);
  const miles   = place && location ? distanceMiles(location, place) : null;
  const meters  = place && location ? distanceMeters(location, place) : null;
  const arrived = Number.isFinite(meters) && meters <= ARRIVED_METERS;

  const routingOn = isRoutingConfigured(appSettings);

  // Fetch a route when we first have a location, when the mode changes, or
  // when the user has moved more than ~60 m from where the route started.
  const loadRoute = useCallback(async (from) => {
    if (!place || !from || !routingOn) return;
    setLoading(true); setRouteError(null);
    try {
      const data = await fetchRoute(appSettings, { from, to: place, mode });
      setRoute(data);
      routeOriginRef.current = from;
    } catch (err) {
      setRoute(null);
      setRouteError(err.message);
    } finally {
      setLoading(false);
    }
  }, [place, routingOn, appSettings, mode]);

  useEffect(() => {
    if (!location) return;
    const origin = routeOriginRef.current;
    const moved  = origin ? distanceMeters(origin, location) : Infinity;
    if (!routeData || moved > 60) loadRoute(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.latitude, location?.longitude, mode, loadRoute]);

  const region = useMemo(() => {
    if (!place) return null;
    if (routeData?.coordinates?.length) return regionFromCoords(routeData.coordinates, 1.4);
    if (location) return regionFromCoords([location, place], 1.6);
    return regionAround(place, 1);
  }, [place, location, routeData]);

  useEffect(() => {
    if (region && mapRef.current) mapRef.current.animateToRegion(region, 500);
  }, [region]);

  const openInMaps = async () => {
    if (!place) return;
    const url = buildMapsUrl({ ...place, mode });
    try {
      const ok = await Linking.canOpenURL(url);
      await Linking.openURL(ok ? url : buildWebFallback({ ...place, mode }));
    } catch (err) {
      showAlert('Could not open maps', 'No map app is available on this device.');
    }
  };

  if (!place) {
    return (
      <View style={[styles.missing, { paddingTop: insets.top }]}>
        <Text style={typography.subheading}>Place not found</Text>
        <PrimaryButton label="Go back" variant="secondary" onPress={() => navigation.goBack()} style={styles.missingButton} />
      </View>
    );
  }

  const nextStep = routeData?.steps?.find((s) => s.maneuver !== 'depart') || routeData?.steps?.[0] || null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        showsUserLocation={!!location}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
      >
        <Marker coordinate={{ latitude: place.latitude, longitude: place.longitude }} anchor={{ x: 0.5, y: 1 }}>
          <PlacePin pinClass={pinClass} selected size={40} />
        </Marker>
        {routeData?.coordinates?.length ? (
          <Polyline coordinates={routeData.coordinates} strokeColor={colors.primary} strokeWidth={5} />
        ) : location ? (
          <Polyline
            coordinates={[
              { latitude: location.latitude, longitude: location.longitude },
              { latitude: place.latitude,    longitude: place.longitude },
            ]}
            strokeColor={colors.primary}
            strokeWidth={4}
            lineDashPattern={[8, 6]}
          />
        ) : null}
      </MapView>

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.round} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
          <View style={styles.headRow}>
            <View style={styles.headText}>
              <Text style={styles.name} numberOfLines={1}>{place.name}</Text>
              {place.address ? <Text style={styles.address} numberOfLines={1}>{place.address}</Text> : null}
            </View>
            {location ? <HeadingArrow from={location} to={place} heading={heading} size={52} showLabel={false} /> : null}
          </View>

          {/* Live distance + heading */}
          <View style={styles.liveRow}>
            <Text style={styles.liveDistance}>
              {arrived
                ? "You're here"
                : Number.isFinite(meters)
                  ? meters < 400 ? `${Math.round(meters)} m away` : `${formatDistance(miles)} away`
                  : 'Distance unavailable — location is off'}
            </Text>
            {location && !arrived ? (
              <HeadingArrow from={location} to={place} heading={heading} labelOnly style={styles.headingLabelOnly} />
            ) : null}
          </View>

          <View style={styles.modes}>
            {MODES.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setMode(m.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === m.key }}
                style={[styles.mode, mode === m.key && styles.modeActive]}
              >
                <Ionicons name={m.icon} size={20} color={mode === m.key ? colors.textOnDark : colors.textPrimary} />
                <Text style={[styles.modeText, mode === m.key && styles.modeTextActive]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Route summary from the server */}
          {routingOn ? (
            loading && !routeData ? (
              <Text style={styles.routeMeta}>Finding a route…</Text>
            ) : routeData ? (
              <>
                <Text style={styles.routeMeta}>
                  {formatMeters(routeData.distanceMeters)} · {formatDuration(routeData.durationSeconds)} {mode === ROUTE_MODES.WALKING ? 'walking' : 'driving'}
                  {loading ? ' · updating…' : ''}
                </Text>
                {nextStep ? <Text style={styles.nextStep}>{nextStep.instruction} · {formatMeters(nextStep.distanceMeters)}</Text> : null}
                <Pressable onPress={() => setShowSteps((v) => !v)} style={styles.stepsToggle} accessibilityRole="button">
                  <Text style={styles.stepsToggleText}>{showSteps ? 'Hide steps' : `Show all ${routeData.steps.length} steps`}</Text>
                  <Ionicons name={showSteps ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
                </Pressable>
                {showSteps ? (
                  <View style={styles.steps}>
                    {routeData.steps.map((s, i) => (
                      <View key={i} style={styles.step}>
                        <Text style={styles.stepIndex}>{i + 1}</Text>
                        <View style={styles.stepText}>
                          <Text style={styles.stepInstruction}>{s.instruction}</Text>
                          <Text style={styles.stepMeta}>{formatMeters(s.distanceMeters)}{s.durationSeconds ? ` · ${formatDuration(s.durationSeconds)}` : ''}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
                {isPublicDemoRouter(appSettings) ? (
                  <Text style={styles.hint}>Route from the public OSRM demo server (testing only; may not use a walking profile).</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.routeMeta}>
                {miles !== null ? `${formatDistance(miles)} straight-line` : 'Distance unavailable — location is off'}
                {routeError ? ` · ${routeError}` : ''}
              </Text>
            )
          ) : (
            <Text style={styles.routeMeta}>{miles !== null ? `${formatDistance(miles)} straight-line` : 'Distance unavailable — location is off'}</Text>
          )}

          {banner && banner.showOnNavigation ? <PartnerBanner banner={banner} compact style={styles.partner} /> : null}

          <View style={styles.actions}>
            <PrimaryButton label="Open in Maps app" variant="secondary" onPress={openInMaps} style={styles.action} />
            {routingOn && !routeData && !loading ? (
              <PrimaryButton label="Retry route" onPress={() => location && loadRoute(location)} style={styles.action} />
            ) : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { position: 'absolute', left: spacing.lg },
  round: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '62%', backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.lg, ...shadows.floating },
  sheetScroll: { flexGrow: 0 },
  sheetContent: { paddingHorizontal: spacing.lg },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headText: { flex: 1 },
  name: { ...typography.subheading },
  address: { ...typography.caption, marginTop: 2 },
  liveRow: { marginTop: spacing.md },
  liveDistance: { ...typography.heading },
  headingLabelOnly: { textAlign: 'left', marginTop: 2 },
  modes: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  mode: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, height: 44, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  modeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { ...typography.captionMedium, color: colors.textPrimary },
  modeTextActive: { color: colors.textOnDark },
  routeMeta: { ...typography.bodyMedium, marginTop: spacing.md },
  nextStep: { ...typography.caption, marginTop: 2 },
  stepsToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  stepsToggleText: { ...typography.captionMedium, color: colors.primary },
  steps: { marginTop: spacing.sm, gap: spacing.sm },
  step: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stepIndex: { ...typography.badge, width: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.background, color: colors.textPrimary, textAlign: 'center', lineHeight: 22 },
  stepText: { flex: 1 },
  stepInstruction: { ...typography.caption, color: colors.textPrimary },
  stepMeta: { ...typography.label },
  hint: { ...typography.label, marginTop: spacing.xs },
  partner: { marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  action: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  missingButton: { marginTop: spacing.lg, alignSelf: 'stretch' },
});

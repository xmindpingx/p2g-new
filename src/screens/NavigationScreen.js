// places2go — NavigationScreen (wireframe #6)
// Preview map with user + destination pins and a straight line between them,
// the straight-line distance, and a "Start Navigation" button that opens the
// phone's map app (Apple Maps on iOS, Google Maps on Android) for turn-by-turn.
//
// No route time or road distance is shown here: that needs a routing service,
// and the app does not have one. The label reads "straight-line" so nobody
// mistakes it for a driving estimate.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, Linking, Alert, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, shadows } from '../theme';
import useStore from '../store/useStore';
import useUserLocation from '../hooks/useUserLocation';
import { distanceMiles, formatDistance, regionAround, regionFromCoords } from '../utils/geo';
import PlacePin, { PIN_VARIANTS } from '../components/PlacePin';
import PrimaryButton from '../components/PrimaryButton';

const MODES = [
  { key: 'walking', label: 'Walk',  icon: 'walk-outline' },
  { key: 'driving', label: 'Drive', icon: 'car-outline' },
  { key: 'transit', label: 'Transit', icon: 'bus-outline' },
];

function buildMapsUrl({ latitude, longitude, name, mode }) {
  const label = encodeURIComponent(name || 'Destination');
  if (Platform.OS === 'ios') {
    const flag = mode === 'walking' ? 'w' : mode === 'transit' ? 'r' : 'd';
    return `maps://?daddr=${latitude},${longitude}&q=${label}&dirflg=${flag}`;
  }
  return `google.navigation:q=${latitude},${longitude}&mode=${mode === 'walking' ? 'w' : mode === 'transit' ? 'r' : 'd'}`;
}

function buildWebFallback({ latitude, longitude, mode }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=${mode}`;
}

export default function NavigationScreen({ navigation, route }) {
  const insets  = useSafeAreaInsets();
  const mapRef  = useRef(null);
  const placeId = route.params?.placeId;
  const place   = useStore((s) => s.places.find((p) => p.id === placeId) || null);
  const { location } = useUserLocation();
  const [mode, setMode] = useState('walking');

  const miles = place && location ? distanceMiles(location, place) : null;

  const region = useMemo(() => {
    if (!place) return null;
    if (location) return regionFromCoords([location, place], 1.6);
    return regionAround(place, 1);
  }, [place, location]);

  useEffect(() => {
    if (region && mapRef.current) mapRef.current.animateToRegion(region, 500);
  }, [region]);

  const start = async () => {
    if (!place) return;
    const url = buildMapsUrl({ ...place, mode });
    try {
      const ok = await Linking.canOpenURL(url);
      await Linking.openURL(ok ? url : buildWebFallback({ ...place, mode }));
    } catch (err) {
      Alert.alert('Could not open maps', 'No map app is available on this device.');
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
          <PlacePin variant={PIN_VARIANTS.SELECTED} size={40} />
        </Marker>
        {location ? (
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
        <Text style={styles.name} numberOfLines={1}>{place.name}</Text>
        {place.address ? <Text style={styles.address} numberOfLines={1}>{place.address}</Text> : null}

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

        <Text style={styles.distance}>
          {miles !== null ? `${formatDistance(miles)} straight-line` : 'Distance unavailable — location is off'}
        </Text>
        <Text style={styles.hint}>Turn-by-turn directions open in your map app.</Text>

        <PrimaryButton label="Start Navigation" onPress={start} style={styles.button} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { position: 'absolute', left: spacing.lg },
  round: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, ...shadows.floating },
  name: { ...typography.subheading },
  address: { ...typography.caption, marginTop: 2 },
  modes: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  mode: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, height: 44, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  modeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { ...typography.captionMedium, color: colors.textPrimary },
  modeTextActive: { color: colors.textOnDark },
  distance: { ...typography.bodyMedium, marginTop: spacing.lg },
  hint: { ...typography.label, marginTop: 2 },
  button: { marginTop: spacing.lg },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  missingButton: { marginTop: spacing.lg, alignSelf: 'stretch' },
});

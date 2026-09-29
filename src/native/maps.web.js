// places2go — Map platform wrapper (web)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// react-native-maps has no web implementation, so on the web the map is
// Leaflet with OpenStreetMap raster tiles. This file exposes the subset of the
// react-native-maps API the screens use:
//
//   <MapView ref initialRegion style onPress showsUserLocation mapPadding>
//     ref.animateToRegion(region, durationMs)
//     ref.fitToCoordinates(coords, { edgePadding, animated })
//   <Marker coordinate anchor zIndex onPress accessibilityLabel>{children}</Marker>
//   <Polyline coordinates strokeColor strokeWidth lineDashPattern />
//
// Markers are ordinary React children (the same PlacePin views the native app
// uses) positioned absolutely over the map with map.latLngToContainerPoint,
// re-projected whenever the map moves or zooms. Polylines are Leaflet layers.
//
// Tiles come from tile.openstreetmap.org. OSM's tile usage policy requires
// attribution (rendered bottom-right) and is intended for light use; for a
// production web build point TILE_URL at your own tile server or a provider.

import React, {
  createContext, forwardRef, useContext, useEffect, useImperativeHandle,
  useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TILE_URL     = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const MAX_ZOOM     = 19;

const MapContext = createContext(null);

// ---------------------------------------------------------------------------
// Region helpers — react-native-maps region ↔ Leaflet bounds
// ---------------------------------------------------------------------------
const regionToBounds = (region) => {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  return L.latLngBounds(
    [latitude - latitudeDelta / 2, longitude - longitudeDelta / 2],
    [latitude + latitudeDelta / 2, longitude + longitudeDelta / 2],
  );
};

const paddingOptions = (pad) => ({
  paddingTopLeft:     [pad?.left || 0,  pad?.top || 0],
  paddingBottomRight: [pad?.right || 0, pad?.bottom || 0],
});

// ---------------------------------------------------------------------------
// MapView
// ---------------------------------------------------------------------------
const MapView = forwardRef(function MapView(
  { style, initialRegion, children, onPress, showsUserLocation = false, mapPadding },
  ref,
) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const userLayerRef = useRef(null);
  const paddingRef   = useRef(mapPadding);
  paddingRef.current = mapPadding;

  // Bumps on every move/zoom so markers re-project.
  const [viewVersion, setViewVersion] = useState(0);
  const [mapReady, setMapReady]       = useState(false);

  // Create the Leaflet map once the container is in the DOM.
  useLayoutEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = L.map(containerRef.current, {
      zoomControl: false, // the native app shows no zoom buttons; the wheel and pinch still zoom
      attributionControl: true,
      maxZoom: MAX_ZOOM,
    });
    L.tileLayer(TILE_URL, { maxZoom: MAX_ZOOM, attribution: ATTRIBUTION }).addTo(map);

    if (initialRegion) map.fitBounds(regionToBounds(initialRegion), paddingOptions(paddingRef.current));
    else map.setView([0, 0], 2);

    const bump = () => setViewVersion((v) => v + 1);
    map.on('move zoom viewreset resize', bump);
    map.on('click', (e) => {
      onPressRef.current?.({
        nativeEvent: { coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng } },
      });
    });

    mapRef.current = map;
    setMapReady(true);

    // Leaflet needs a size pass after RN-web lays out the flex container.
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => map.invalidateSize())
      : null;
    if (observer) observer.observe(containerRef.current);

    return () => {
      if (observer) observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // initialRegion is intentionally read once, matching react-native-maps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  // Blue "you are here" dot from the browser's Geolocation API.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showsUserLocation || typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude];
        if (!userLayerRef.current) {
          userLayerRef.current = L.circleMarker(latlng, {
            radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#1A73E8', fillOpacity: 1,
          }).addTo(map);
        } else {
          userLayerRef.current.setLatLng(latlng);
        }
      },
      () => { /* permission denied or unavailable — no dot */ },
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (userLayerRef.current) { userLayerRef.current.remove(); userLayerRef.current = null; }
    };
  }, [showsUserLocation, mapReady]);

  useImperativeHandle(ref, () => ({
    animateToRegion(region, duration = 500) {
      const map = mapRef.current;
      if (!map || !region) return;
      map.flyToBounds(regionToBounds(region), { ...paddingOptions(paddingRef.current), duration: duration / 1000 });
    },
    fitToCoordinates(coords = [], { edgePadding, animated = true } = {}) {
      const map = mapRef.current;
      if (!map || coords.length === 0) return;
      const bounds = L.latLngBounds(coords.map((c) => [c.latitude, c.longitude]));
      const opts = paddingOptions(edgePadding || paddingRef.current);
      if (animated) map.flyToBounds(bounds, opts); else map.fitBounds(bounds, opts);
    },
    getMap() { return mapRef.current; },
  }), []);

  const ctx = useMemo(() => ({ map: mapRef.current, viewVersion }), [viewVersion, mapReady]);

  return (
    <View style={[styles.container, style]}>
      <div ref={containerRef} style={leafletContainerStyle} />
      {/* Marker overlay: pointer events pass through to the map except on markers */}
      <View style={styles.overlay}>
        <MapContext.Provider value={ctx}>{mapReady ? children : null}</MapContext.Provider>
      </View>
    </View>
  );
});

export default MapView;

// ---------------------------------------------------------------------------
// Marker — children rendered at the projected container point
// ---------------------------------------------------------------------------
export function Marker({ coordinate, anchor = { x: 0.5, y: 1 }, zIndex = 0, onPress, accessibilityLabel, children }) {
  const { map } = useContext(MapContext) || {};
  if (!map || !coordinate) return null;

  const point = map.latLngToContainerPoint([coordinate.latitude, coordinate.longitude]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[
        styles.marker,
        {
          left: point.x,
          top:  point.y,
          zIndex,
          transform: [{ translateX: `${-anchor.x * 100}%` }, { translateY: `${-anchor.y * 100}%` }],
        },
      ]}
    >
      <div
        role={onPress ? 'button' : undefined}
        style={{ cursor: onPress ? 'pointer' : 'default', pointerEvents: 'auto' }}
        onClick={(e) => {
          if (!onPress) return;
          e.stopPropagation();
          onPress({ nativeEvent: { coordinate }, stopPropagation: () => {} });
        }}
      >
        {children}
      </div>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Polyline — a Leaflet layer kept in sync with props
// ---------------------------------------------------------------------------
export function Polyline({ coordinates = [], strokeColor = '#000000', strokeWidth = 3, lineDashPattern }) {
  const { map } = useContext(MapContext) || {};
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map) return undefined;
    const latlngs = coordinates.map((c) => [c.latitude, c.longitude]);
    const options = {
      color:     strokeColor,
      weight:    strokeWidth,
      dashArray: lineDashPattern ? lineDashPattern.join(' ') : null,
      lineCap:   'round',
      lineJoin:  'round',
    };
    if (!layerRef.current) {
      layerRef.current = L.polyline(latlngs, options).addTo(map);
    } else {
      layerRef.current.setLatLngs(latlngs);
      layerRef.current.setStyle(options);
    }
    return undefined;
  }, [map, coordinates, strokeColor, strokeWidth, lineDashPattern]);

  useEffect(() => () => { if (layerRef.current) { layerRef.current.remove(); layerRef.current = null; } }, []);

  return null;
}

// ---------------------------------------------------------------------------
// Stacking: Leaflet gives its panes z-index 400 and its controls 1000. Without
// a stacking context of their own those values would escape the map and paint
// over the app's search bar, floating buttons and tab bar (making them
// unclickable). The container View carries zIndex 0 so it forms its own
// context; inside it the Leaflet div sits at 0 and the marker overlay at 1.
const leafletContainerStyle = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 };

const styles = StyleSheet.create({
  container: { overflow: 'hidden', zIndex: 0 },
  overlay:   { ...StyleSheet.absoluteFillObject, zIndex: 1, pointerEvents: 'box-none' },
  marker:    { position: 'absolute', pointerEvents: 'box-none' },
});

// places2go — useUserLocation
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Thin wrapper over expo-location: asks for foreground permission once,
// returns the current coordinates, and exposes a refresh() for the locate button.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export const LOCATION_STATUS = {
  IDLE:        'idle',
  REQUESTING:  'requesting',
  GRANTED:     'granted',
  DENIED:      'denied',       // user refused permission
  UNAVAILABLE: 'unavailable',  // permission granted but device location services are off
  ERROR:       'error',
};

const coordsOf = (position) => ({
  latitude:  position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy:  position.coords.accuracy ?? null,
  timestamp: position.timestamp ?? Date.now(),
});

import { useMemo } from 'react';
import useStore from '../store/useStore';
import { selectDebugLocation } from '../utils/debugLocation';

export default function useUserLocation({ autoRequest = true, watch = false, watchIntervalMs = 3000 } = {}) {
  const fake = useStore(selectDebugLocation);
  const [location, setLocation]     = useState(null);
  const [status, setStatus]         = useState(LOCATION_STATUS.IDLE);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [error, setError]           = useState(null);
  const mounted = useRef(true);
  const watchRef = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (watchRef.current) { watchRef.current.remove(); watchRef.current = null; }
    };
  }, []);

  // Continuous updates (directions / approach mode). Starts once permission is granted.
  useEffect(() => {
    if (!watch || status !== LOCATION_STATUS.GRANTED) return undefined;
    let cancelled = false;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: watchIntervalMs, distanceInterval: 2 },
      (position) => { if (!cancelled && mounted.current) setLocation(coordsOf(position)); },
    ).then((sub) => {
      if (cancelled) sub.remove(); else watchRef.current = sub;
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (watchRef.current) { watchRef.current.remove(); watchRef.current = null; }
    };
  }, [watch, status, watchIntervalMs]);

  const request = useCallback(async () => {
    if (mounted.current) {
      setStatus(LOCATION_STATUS.REQUESTING);
      setError(null);
    }
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (mounted.current) setCanAskAgain(permission.canAskAgain !== false);

      if (permission.status !== 'granted') {
        if (mounted.current) setStatus(LOCATION_STATUS.DENIED);
        return null;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        if (mounted.current) setStatus(LOCATION_STATUS.UNAVAILABLE);
        return null;
      }

      // Show the last known fix immediately (if any), then refine with a fresh one.
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown && mounted.current) {
        setLocation(coordsOf(lastKnown));
        setStatus(LOCATION_STATUS.GRANTED);
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = coordsOf(current);
      if (mounted.current) {
        setLocation(coords);
        setStatus(LOCATION_STATUS.GRANTED);
      }
      return coords;
    } catch (err) {
      if (mounted.current) {
        setStatus(LOCATION_STATUS.ERROR);
        setError(err?.message || 'Unable to determine your location');
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (autoRequest) request();
  }, [autoRequest, request]);

  // Admin test location (utils/debugLocation.js) replaces the real fix everywhere.
  const fakeLocation = useMemo(
    () => (fake ? { latitude: fake.latitude, longitude: fake.longitude, accuracy: 5, timestamp: Date.parse(fake.setAt) || Date.now(), mocked: true } : null),
    [fake],
  );
  if (fakeLocation) return { location: fakeLocation, status: LOCATION_STATUS.GRANTED, canAskAgain: true, error: null, refresh: async () => fakeLocation };

  return { location, status, canAskAgain, error, refresh: request };
}

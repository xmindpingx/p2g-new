// places2go — useHeading
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Device heading (degrees clockwise from north) from the OS compass / motion
// sensors through expo-location's watchHeadingAsync. trueHeading is used when
// the OS provides it (needs location services); magnetic heading otherwise.
// Returns null until the first reading, and null on devices without a compass.

import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export default function useHeading({ active = true } = {}) {
  const [heading, setHeading]   = useState(null);
  const [accuracy, setAccuracy] = useState(null); // 0–3 per expo-location; higher is better
  const subscriptionRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted' || cancelled) return;
        subscriptionRef.current = await Location.watchHeadingAsync((h) => {
          if (cancelled) return;
          const value = Number.isFinite(h.trueHeading) && h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (Number.isFinite(value)) setHeading(value);
          if (Number.isFinite(h.accuracy)) setAccuracy(h.accuracy);
        });
      } catch (err) {
        // No compass on this device, or the sensor could not be started — heading stays null.
      }
    };
    if (active) start();
    return () => {
      cancelled = true;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
    };
  }, [active]);

  return { heading, accuracy };
}

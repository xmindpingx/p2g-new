// places2go — useCountryCode
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Resolves the ISO country code of the device's current position by reverse
// geocoding it with Nominatim (the same keyless service the app already uses
// for addresses). Used to decide which payout methods can be offered.
//
//   { countryCode, status, refresh }
//   status: 'idle' | 'locating' | 'resolving' | 'known' | 'denied' | 'unavailable' | 'error'
//
// The result is cached for the app session so the lookup happens once.

import { useCallback, useEffect, useRef, useState } from 'react';
import useUserLocation, { LOCATION_STATUS } from './useUserLocation';
import { reverseGeocode } from '../services/nominatim';

let cached = null; // { countryCode, at }
const CACHE_MS = 30 * 60 * 1000;

export default function useCountryCode() {
  const { location, status: locStatus, refresh } = useUserLocation({ autoRequest: true });
  const [countryCode, setCountryCode] = useState(cached && Date.now() - cached.at < CACHE_MS ? cached.countryCode : null);
  const [status, setStatus] = useState(countryCode ? 'known' : 'idle');
  const inFlight = useRef(false);

  useEffect(() => {
    if (countryCode) return undefined;
    if (locStatus === LOCATION_STATUS.DENIED)      { setStatus('denied');      return undefined; }
    if (locStatus === LOCATION_STATUS.UNAVAILABLE) { setStatus('unavailable'); return undefined; }
    if (locStatus === LOCATION_STATUS.ERROR)       { setStatus('error');       return undefined; }
    if (!location) { setStatus('locating'); return undefined; }
    if (inFlight.current) return undefined;

    let cancelled = false;
    inFlight.current = true;
    setStatus('resolving');
    reverseGeocode(location.latitude, location.longitude)
      .then((result) => {
        if (cancelled) return;
        const code = result?.address?.countryCode || null;
        if (code) {
          cached = { countryCode: code, at: Date.now() };
          setCountryCode(code);
          setStatus('known');
        } else {
          setStatus('error');
        }
      })
      .catch(() => { if (!cancelled) setStatus('error'); })
      .finally(() => { inFlight.current = false; });
    return () => { cancelled = true; };
  }, [location, locStatus, countryCode]);

  const retry = useCallback(() => {
    cached = null;
    setCountryCode(null);
    setStatus('idle');
    refresh();
  }, [refresh]);

  return { countryCode, status, refresh: retry };
}

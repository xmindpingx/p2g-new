// places2go — useLiveMap
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// When the admin has enabled the live map and THIS user turned on "Share my
// location", the hook posts a coarsened position on an interval and fetches
// other sharers nearby. Users who do not share still see nothing (sharing is
// reciprocal: you appear only if you share, and you only see others if you do).

import { useEffect, useRef, useState } from 'react';

import useStore from '../store/useStore';
import { isLiveMapConfigured, postMyPosition, fetchNearbyPositions, removeMyPosition } from '../services/liveMap';

export default function useLiveMap({ location, active = true }) {
  const appSettings   = useStore((s) => s.appSettings);
  const currentUser   = useStore((s) => s.currentUser);
  const [others, setOthers] = useState([]);
  const [error, setError]   = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const wasSharingRef = useRef(false);

  const sharing = active && isLiveMapConfigured(appSettings) && currentUser.shareLocation === true;

  useEffect(() => {
    if (!sharing || !location) {
      setOthers([]);
      return undefined;
    }
    let cancelled = false;
    const sync = async () => {
      try {
        await postMyPosition(appSettings, { userId: currentUser.id, latitude: location.latitude, longitude: location.longitude });
        const positions = await fetchNearbyPositions(appSettings, { userId: currentUser.id, latitude: location.latitude, longitude: location.longitude });
        if (!cancelled) { setOthers(positions); setError(null); setLastSyncAt(Date.now()); }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    sync();
    const timer = setInterval(sync, Math.max(10, appSettings.liveMapUpdateIntervalSeconds) * 1000);
    return () => { cancelled = true; clearInterval(timer); };
    // Re-sync when the user moves noticeably (coarsened coordinates change) or settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, location?.latitude?.toFixed(3), location?.longitude?.toFixed(3), appSettings.liveMapUpdateIntervalSeconds, appSettings.liveMapApiBaseUrl, appSettings.liveMapRadiusKm]);

  // Remove our position from the server when sharing is switched off.
  useEffect(() => {
    if (wasSharingRef.current && !sharing && isLiveMapConfigured(appSettings)) {
      removeMyPosition(appSettings, { userId: currentUser.id }).catch(() => {});
    }
    wasSharingRef.current = sharing;
  }, [sharing, appSettings, currentUser.id]);

  return { sharing, others, error, lastSyncAt };
}

// places2go — useVisitEvidence
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// React view over services/visitTracker: starts sampling while a submission
// screen is mounted and exposes the live "am I at this address?" confirmation
// used to allow, or explain, a submission. The tracker itself outlives the
// screen so the post-submit window can record the user leaving.

import { useCallback, useEffect, useState } from 'react';

import useStore from '../store/useStore';
import * as tracker from '../services/visitTracker';
import { distanceMeters } from '../utils/geo';

export const PRESENCE_CONFIRM = {
  CONFIRMED:     'confirmed',      // within radius
  TOO_FAR:       'too_far',        // fix available but outside radius
  NO_TARGET:     'no_target',      // nothing to compare against yet
  NO_PERMISSION: 'no_permission',  // location permission denied
  SERVICES_OFF:  'services_off',   // device location services are off
  WAITING:       'waiting',        // permission ok, no fix yet
  ERROR:         'error',
};

export default function useVisitEvidence({ target = null, active = true, resetOnUnmount = true } = {}) {
  const appSettings = useStore((s) => s.appSettings);
  const [state, setState] = useState(tracker.getState());

  useEffect(() => {
    const unsubscribe = tracker.subscribe(setState);
    if (active) tracker.start();
    return () => {
      unsubscribe();
      // Leaving without submitting: drop the samples. After a submit the screen
      // calls continueAfterSubmit() first, which takes ownership of them.
      if (resetOnUnmount && !tracker.isFinishing()) tracker.reset();
    };
  }, [active, resetOnUnmount]);

  const latest    = state.latest;
  const distanceM = latest && target
    ? distanceMeters({ latitude: latest.lat, longitude: latest.lon }, target)
    : null;

  let confirmation = PRESENCE_CONFIRM.WAITING;
  if (state.permission === 'denied')            confirmation = PRESENCE_CONFIRM.NO_PERMISSION;
  else if (state.permission === 'services_off') confirmation = PRESENCE_CONFIRM.SERVICES_OFF;
  else if (state.permission === 'error')        confirmation = PRESENCE_CONFIRM.ERROR;
  else if (!target)                             confirmation = PRESENCE_CONFIRM.NO_TARGET;
  else if (!Number.isFinite(distanceM))         confirmation = PRESENCE_CONFIRM.WAITING;
  else confirmation = distanceM <= appSettings.submissionPresenceRadiusMeters ? PRESENCE_CONFIRM.CONFIRMED : PRESENCE_CONFIRM.TOO_FAR;

  const submitAllowed = !appSettings.requirePresenceToSubmit || confirmation === PRESENCE_CONFIRM.CONFIRMED;

  return {
    latest,
    sampleCount:   state.sampleCount,
    permission:    state.permission,
    canAskAgain:   state.canAskAgain,
    restroomFix:   state.restroomFix,
    distanceM,
    confirmation,
    submitAllowed,
    radiusM:       appSettings.submissionPresenceRadiusMeters,
    markRestroomFix:     tracker.markRestroomFix,
    getSamples:          tracker.getSamples,
    continueAfterSubmit: tracker.continueAfterSubmit,
    discard:             tracker.reset,
    retry:               useCallback(() => tracker.start(), []),
  };
}

/**
 * explainConfirmation(confirmation, { distanceM, radiusM, placeLabel })
 * → { title, message, showSettings } — friendly copy for the status card.
 */
export function explainConfirmation(confirmation, { distanceM = null, radiusM, placeLabel = 'this address' } = {}) {
  switch (confirmation) {
    case PRESENCE_CONFIRM.CONFIRMED:
      return { title: 'Location confirmed', message: `You are about ${Math.round(distanceM)} m from ${placeLabel}.`, showSettings: false };
    case PRESENCE_CONFIRM.TOO_FAR:
      return { title: "You're not at this address yet", message: `Your device is about ${Math.round(distanceM)} m away. Submissions are accepted within ${radiusM} m so the map stays accurate — head over and try again.`, showSettings: false };
    case PRESENCE_CONFIRM.NO_PERMISSION:
      return { title: "We can't confirm your location", message: 'places2go needs location access to confirm you are at the place you are submitting. Please allow location for places2go in your device settings.', showSettings: true };
    case PRESENCE_CONFIRM.SERVICES_OFF:
      return { title: 'Location services are off', message: 'Turn on location services in your device settings so we can confirm you are at this address.', showSettings: true };
    case PRESENCE_CONFIRM.NO_TARGET:
      return { title: 'Pick an address first', message: 'Once you choose an address we will check that you are there.', showSettings: false };
    case PRESENCE_CONFIRM.ERROR:
      return { title: "We couldn't read your location", message: 'Your device did not return a position. Check that location services are on, then try again.', showSettings: true };
    default:
      return { title: 'Finding your location…', message: 'Waiting for a GPS fix. This usually takes a few seconds outdoors.', showSettings: false };
  }
}

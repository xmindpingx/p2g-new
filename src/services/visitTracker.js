// places2go — visitTracker (module singleton)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Records device location samples while a submission screen is open and, after
// submit, keeps recording for appSettings.presencePostSubmitWindowSeconds so
// the "left the premises" part of the timeline is captured even though the
// screen has already navigated away. When the window ends the complete sample
// list is handed to the store (finalizeVisitEvidence) and cleared.
//
// Samples live only in memory on the device until the store receives them.

import * as Location from 'expo-location';
import useStore from '../store/useStore';
import { toSample } from './presence';
import { selectDebugLocation, debugPosition } from '../utils/debugLocation';

const MAX_SAMPLES = 2000;

let subscription = null;
let samples      = [];
let restroomFix  = null;
let permission   = 'unknown'; // 'granted' | 'denied' | 'services_off' | 'error' | 'unknown'
let canAskAgain  = true;
let postSubmitTimer = null;
const listeners  = new Set();

const notify = () => { for (const fn of listeners) fn(getState()); };

export function getState() {
  return {
    latest:      samples.length ? samples[samples.length - 1] : null,
    sampleCount: samples.length,
    permission,
    canAskAgain,
    restroomFix,
    tracking:    subscription !== null,
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(getState());
  return () => listeners.delete(fn);
}

export function getSamples() { return [...samples]; }

async function openSubscription() {
  if (subscription) return;
  const intervalMs = Math.max(2, useStore.getState().appSettings.presenceSampleIntervalSeconds) * 1000;

  // Admin test location: emit a sample at the test point on the same cadence,
  // marked mocked so the evidence is honest about what it is.
  const fake = selectDebugLocation(useStore.getState());
  if (fake) {
    const emit = () => {
      const f = selectDebugLocation(useStore.getState());
      const sample = f ? toSample(debugPosition(f)) : null;
      if (!sample) return;
      samples = [...samples, sample].slice(-MAX_SAMPLES);
      notify();
    };
    emit();
    const id = setInterval(emit, intervalMs);
    subscription = { remove: () => clearInterval(id) };
    notify();
    return;
  }

  subscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: intervalMs, distanceInterval: 0 },
    (loc) => {
      const s = toSample(loc);
      if (!s) return;
      samples = [...samples, s].slice(-MAX_SAMPLES);
      notify();
    },
  );
  notify();
}

/**
 * start() — request permission and begin sampling. Safe to call repeatedly.
 * If a post-submit window is still running (user opened Add Place again
 * quickly), it is cancelled and the previous submission is finalised first.
 */
export async function start() {
  if (postSubmitTimer) finishNow();
  if (selectDebugLocation(useStore.getState())) { permission = 'granted'; canAskAgain = true; await openSubscription(); return; }
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    canAskAgain = perm.canAskAgain !== false;
    if (perm.status !== 'granted') { permission = 'denied'; notify(); return; }
    const services = await Location.hasServicesEnabledAsync();
    if (!services) { permission = 'services_off'; notify(); return; }
    permission = 'granted';
    await openSubscription();
  } catch (err) {
    permission = 'error';
    notify();
  }
}

export function stop() {
  if (subscription) { subscription.remove(); subscription = null; }
  notify();
}

/** reset() — forget everything (used when Add Place is dismissed without submitting). */
export function reset() {
  stop();
  samples = [];
  restroomFix = null;
  if (postSubmitTimer) { clearTimeout(postSubmitTimer); postSubmitTimer = null; }
  notify();
}

/** markRestroomFix() — one high-accuracy fix while standing at the restroom door. */
export async function markRestroomFix() {
  try {
    const fake = selectDebugLocation(useStore.getState());
    const loc = fake ? debugPosition(fake) : await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    const s = toSample(loc);
    if (!s) return null;
    restroomFix = { lat: s.lat, lon: s.lon, accuracy: s.accuracy, at: s.at };
    samples = [...samples, s].slice(-MAX_SAMPLES);
    notify();
    return restroomFix;
  } catch (err) {
    return null;
  }
}

let pendingPlaceId = null;

/** isFinishing() — true while the post-submit window is recording. */
export function isFinishing() { return pendingPlaceId !== null; }

function finishNow() {
  if (postSubmitTimer) { clearTimeout(postSubmitTimer); postSubmitTimer = null; }
  const placeId = pendingPlaceId;
  pendingPlaceId = null;
  if (placeId) {
    try {
      useStore.getState().finalizeVisitEvidence(placeId, { allSamples: getSamples(), restroomFix });
    } catch (err) {
      // evidence is best-effort; the submission itself already succeeded
    }
  }
  stop();
  samples = [];
  restroomFix = null;
  notify();
}

/**
 * continueAfterSubmit(placeId) — keep sampling for the configured window,
 * then finalise the evidence on the store and clear.
 */
export function continueAfterSubmit(placeId) {
  pendingPlaceId = placeId;
  const windowMs = Math.max(0, useStore.getState().appSettings.presencePostSubmitWindowSeconds) * 1000;
  if (windowMs === 0 || permission !== 'granted') { finishNow(); return; }
  if (!subscription) openSubscription().catch(() => {});
  if (postSubmitTimer) clearTimeout(postSubmitTimer);
  postSubmitTimer = setTimeout(finishNow, windowMs);
}

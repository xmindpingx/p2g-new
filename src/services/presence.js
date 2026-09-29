// places2go — Presence check & payout-risk evaluation (pure functions)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Goal: make it hard to claim a credit for a place nobody visited, without
// pretending to be certain. Everything here is computed from the location
// samples the device actually recorded while Add Place was open (and for a
// short window after submit). The admin sees the underlying facts on every
// credit — distance, dwell time, approach / departure movement, GPS accuracy,
// mock-location flag, duplicates, rate limits — and makes the call.
//
// The level (strong / moderate / weak / failed) is a fixed rule set, listed
// below, not a probability. Nothing is estimated.

import { distanceMiles } from '../utils/geo';

const METERS_PER_MILE = 1609.344;

export const PRESENCE_LEVEL = {
  STRONG:      'strong',
  MODERATE:    'moderate',
  WEAK:        'weak',
  FAILED:      'failed',
  UNAVAILABLE: 'unavailable', // check disabled, or location permission denied
};

export const PRESENCE_LEVEL_LABELS = {
  [PRESENCE_LEVEL.STRONG]:      'Strong',
  [PRESENCE_LEVEL.MODERATE]:    'Moderate',
  [PRESENCE_LEVEL.WEAK]:        'Weak',
  [PRESENCE_LEVEL.FAILED]:      'Failed',
  [PRESENCE_LEVEL.UNAVAILABLE]: 'Not available',
};

export const RISK_FLAG = {
  PRESENCE_FAILED:      'presence_failed',
  PRESENCE_WEAK:        'presence_weak',
  PRESENCE_UNAVAILABLE: 'presence_unavailable',
  MOCK_LOCATION:        'mock_location',
  DUPLICATE_PLACE:      'duplicate_place',
  DAILY_CAP:            'daily_cap_reached',
  COOLDOWN:             'cooldown_active',
};

export const RISK_FLAG_LABELS = {
  [RISK_FLAG.PRESENCE_FAILED]:      'Presence check failed',
  [RISK_FLAG.PRESENCE_WEAK]:        'Presence check weak',
  [RISK_FLAG.PRESENCE_UNAVAILABLE]: 'Presence check not available',
  [RISK_FLAG.MOCK_LOCATION]:        'Mock location reported by device',
  [RISK_FLAG.DUPLICATE_PLACE]:      'Possible duplicate of an existing place',
  [RISK_FLAG.DAILY_CAP]:            'Daily credited-submission cap reached',
  [RISK_FLAG.COOLDOWN]:             'Submitted within the cooldown window',
};

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------
/**
 * toSample(locationObject) — normalise an expo-location LocationObject.
 * `mocked` is only reported by Android; it is null where the OS gives nothing.
 */
export function toSample(loc) {
  if (!loc?.coords) return null;
  return {
    lat:      loc.coords.latitude,
    lon:      loc.coords.longitude,
    accuracy: Number.isFinite(loc.coords.accuracy) ? loc.coords.accuracy : null, // metres
    speed:    Number.isFinite(loc.coords.speed) ? loc.coords.speed : null,       // m/s
    at:       Number.isFinite(loc.timestamp) ? loc.timestamp : Date.now(),       // epoch ms
    mocked:   typeof loc.mocked === 'boolean' ? loc.mocked : null,
  };
}

const metersBetween = (a, b) =>
  distanceMiles({ latitude: a.lat, longitude: a.lon }, { latitude: b.lat, longitude: b.lon }) * METERS_PER_MILE;

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// ---------------------------------------------------------------------------
// Zone timeline — what the admin reviews
// ---------------------------------------------------------------------------
export const ZONE = {
  RESTROOM: 'restroom', // within presenceInnerRadiusMeters of the marked restroom spot (or the pin if none)
  PREMISES: 'premises', // within presenceRadiusMeters of the pin
  NEARBY:   'nearby',   // within 2× radius
  AWAY:     'away',
};

export const ZONE_LABELS = {
  [ZONE.RESTROOM]: 'At restroom spot',
  [ZONE.PREMISES]: 'On premises',
  [ZONE.NEARBY]:   'Nearby',
  [ZONE.AWAY]:     'Away',
};

export const ZONE_ORDER = [ZONE.RESTROOM, ZONE.PREMISES, ZONE.NEARBY, ZONE.AWAY];

const zoneFor = (dPin, dRestroom, radius, innerRadius) => {
  if (dRestroom !== null && dRestroom <= innerRadius) return ZONE.RESTROOM;
  if (dPin <= radius)     return ZONE.PREMISES;
  if (dPin <= radius * 2) return ZONE.NEARBY;
  return ZONE.AWAY;
};

/**
 * buildVisitTimeline({ samples, place, restroomFix, settings })
 *
 * samples must already be filtered to usable accuracy and sorted by time.
 * Each sample is assigned a zone; consecutive samples in the same zone form a
 * segment. A sample's duration is the gap to the next sample (the last sample
 * gets no duration), so totals never count time the device did not report.
 *
 * Returns { segments, totalsSeconds, arrivedAt, departedAt, restroomEnteredAt,
 *           restroomLeftAt, points }
 *   points — downsampled [{ at, dPin, dRestroom, acc, zone }] for the admin chart
 */
export function buildVisitTimeline({ samples = [], place, restroomFix = null, settings }) {
  const radius = settings.presenceRadiusMeters;
  const inner  = settings.presenceInnerRadiusMeters;
  const pin    = { lat: place.latitude, lon: place.longitude };
  const rest   = restroomFix && Number.isFinite(restroomFix.lat) && Number.isFinite(restroomFix.lon)
    ? { lat: restroomFix.lat, lon: restroomFix.lon }
    : null;

  const points = samples.map((s) => {
    const dPin      = metersBetween(s, pin);
    const dRestroom = rest ? metersBetween(s, rest) : null;
    return {
      at:        s.at,
      dPin:      Math.round(dPin),
      dRestroom: dRestroom !== null ? Math.round(dRestroom) : null,
      acc:       s.accuracy !== null ? Math.round(s.accuracy) : null,
      zone:      zoneFor(dPin, dRestroom, radius, inner),
    };
  });

  const segments = [];
  const totalsSeconds = { [ZONE.RESTROOM]: 0, [ZONE.PREMISES]: 0, [ZONE.NEARBY]: 0, [ZONE.AWAY]: 0 };
  for (let i = 0; i < points.length; i += 1) {
    const p    = points[i];
    const next = points[i + 1];
    const dur  = next ? Math.max(0, (next.at - p.at) / 1000) : 0;
    totalsSeconds[p.zone] += dur;
    const last = segments[segments.length - 1];
    if (last && last.zone === p.zone) {
      last.endAt = next ? next.at : p.at;
      last.seconds += dur;
      last.samples += 1;
    } else {
      segments.push({ zone: p.zone, startAt: p.at, endAt: next ? next.at : p.at, seconds: dur, samples: 1 });
    }
  }
  for (const k of Object.keys(totalsSeconds)) totalsSeconds[k] = Math.round(totalsSeconds[k]);
  segments.forEach((seg) => { seg.seconds = Math.round(seg.seconds); });

  const onPremises = points.filter((p) => p.zone === ZONE.PREMISES || p.zone === ZONE.RESTROOM);
  const atRestroom = points.filter((p) => p.zone === ZONE.RESTROOM);
  const lastOn     = onPremises.length ? onPremises[onPremises.length - 1] : null;
  const leftAfter  = lastOn ? points.find((p) => p.at > lastOn.at && (p.zone === ZONE.NEARBY || p.zone === ZONE.AWAY)) : null;

  // Downsample for storage / charting: keep at most 120 points, always first & last
  const MAX_POINTS = 120;
  let stored = points;
  if (points.length > MAX_POINTS) {
    const step = (points.length - 1) / (MAX_POINTS - 1);
    stored = Array.from({ length: MAX_POINTS }, (_, i) => points[Math.round(i * step)]);
  }

  return {
    segments,
    totalsSeconds,
    arrivedAt:         onPremises.length ? onPremises[0].at : null,
    departedAt:        leftAfter ? leftAfter.at : null,
    restroomEnteredAt: atRestroom.length ? atRestroom[0].at : null,
    restroomLeftAt:    atRestroom.length ? atRestroom[atRestroom.length - 1].at : null,
    restroomFixUsed:   !!rest,
    points:            stored,
  };
}

// ---------------------------------------------------------------------------
// Evidence summary
// ---------------------------------------------------------------------------
/**
 * summarizeVisitEvidence({ samples, place, restroomFix, settings, submittedAt })
 *
 * Returns an evidence record for storage on the place:
 *   sampleCount, usableSampleCount  — total, and those within the accuracy limit
 *   distanceAtSubmitM               — from the nearest-in-time sample to the pin
 *   minDistanceM                    — closest the device came to the pin
 *   dwellSeconds                    — time span of samples within the radius
 *   approachDetected                — a sample > 2× radius away BEFORE a sample within radius
 *   departureDetected               — a sample > 2× radius away AFTER the last sample within radius
 *   accuracyMedianM                 — median reported accuracy of usable samples
 *   mockedDetected                  — any sample the OS flagged as mocked
 *   firstSampleAt / lastSampleAt    — epoch ms
 *   level                           — PRESENCE_LEVEL by the rules in levelFor()
 *   reasons                         — human-readable facts behind the level
 */
export function summarizeVisitEvidence({ samples = [], place, restroomFix = null, settings, submittedAt = Date.now() }) {
  const radius      = settings.presenceRadiusMeters;
  const inner       = settings.presenceInnerRadiusMeters;
  const maxAccuracy = settings.presenceMaxAccuracyMeters;
  const minDwell    = settings.presenceMinDwellSeconds;

  const target = { lat: place.latitude, lon: place.longitude };
  const all    = samples.filter((s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lon)).sort((a, b) => a.at - b.at);
  const usable = all.filter((s) => s.accuracy === null || s.accuracy <= maxAccuracy);

  const mockedDetected = all.some((s) => s.mocked === true);

  const restroomFixStored = restroomFix && Number.isFinite(restroomFix.lat) && Number.isFinite(restroomFix.lon)
    ? {
        lat:      restroomFix.lat,
        lon:      restroomFix.lon,
        accuracy: Number.isFinite(restroomFix.accuracy) ? Math.round(restroomFix.accuracy) : null,
        at:       restroomFix.at || null,
        distanceFromPinM: Math.round(metersBetween(restroomFix, target)),
      }
    : null;

  if (usable.length === 0) {
    return {
      checkedAt:        new Date(submittedAt).toISOString(),
      sampleCount:      all.length,
      usableSampleCount: 0,
      distanceAtSubmitM: null,
      minDistanceM:     null,
      dwellSeconds:     0,
      approachDetected: false,
      departureDetected: false,
      accuracyMedianM:  null,
      mockedDetected,
      firstSampleAt:    all.length ? all[0].at : null,
      lastSampleAt:     all.length ? all[all.length - 1].at : null,
      restroomFix:      restroomFixStored,
      timeline:         null,
      level:            mockedDetected ? PRESENCE_LEVEL.FAILED : PRESENCE_LEVEL.UNAVAILABLE,
      reasons:          [
        all.length === 0 ? 'No location samples were recorded.' : `${all.length} sample(s) recorded, none within the ${maxAccuracy} m accuracy limit.`,
        ...(mockedDetected ? ['The device reported a mock location.'] : []),
      ],
      settingsUsed: { radius, inner, maxAccuracy, minDwell },
    };
  }

  const distances = usable.map((s) => ({ ...s, d: metersBetween(s, target) }));
  const within    = distances.filter((s) => s.d <= radius);
  const far       = distances.filter((s) => s.d > radius * 2);

  const nearestInTime = distances.reduce((best, s) =>
    !best || Math.abs(s.at - submittedAt) < Math.abs(best.at - submittedAt) ? s : best, null);

  const minDistanceM = Math.min(...distances.map((s) => s.d));
  const dwellSeconds = within.length >= 2 ? (within[within.length - 1].at - within[0].at) / 1000 : within.length === 1 ? 0 : 0;

  const firstWithinAt = within.length ? within[0].at : null;
  const lastWithinAt  = within.length ? within[within.length - 1].at : null;
  const approachDetected  = firstWithinAt !== null && far.some((s) => s.at < firstWithinAt);
  const departureDetected = lastWithinAt  !== null && far.some((s) => s.at > lastWithinAt);

  const accuracyMedianM = median(usable.map((s) => s.accuracy).filter((a) => a !== null));

  const facts = {
    sampleCount:       all.length,
    usableSampleCount: usable.length,
    distanceAtSubmitM: nearestInTime ? Math.round(nearestInTime.d) : null,
    minDistanceM:      Math.round(minDistanceM),
    dwellSeconds:      Math.round(dwellSeconds),
    approachDetected,
    departureDetected,
    accuracyMedianM:   accuracyMedianM !== null ? Math.round(accuracyMedianM) : null,
    mockedDetected,
    firstSampleAt:     all[0].at,
    lastSampleAt:      all[all.length - 1].at,
  };

  const { level, reasons } = levelFor(facts, { radius, minDwell });
  const timeline = buildVisitTimeline({ samples: usable, place, restroomFix: restroomFixStored, settings });

  if (timeline.restroomFixUsed) {
    reasons.push(`Time within ${inner} m of the marked restroom spot: ${timeline.totalsSeconds[ZONE.RESTROOM]} s.`);
  }
  reasons.push(`Time on premises (within ${radius} m of the pin, excluding restroom zone): ${timeline.totalsSeconds[ZONE.PREMISES]} s.`);

  return {
    checkedAt: new Date(submittedAt).toISOString(),
    ...facts,
    restroomFix: restroomFixStored,
    timeline,
    level,
    reasons,
    settingsUsed: { radius, inner, maxAccuracy, minDwell },
  };
}

/**
 * appendPostSubmitSamples(evidence, newSamples, { place, settings })
 * Re-summarises the evidence with the samples recorded after submit so that
 * departure movement and time-on-premises are captured. `evidence.rawSamples`
 * is kept only until this final pass; the stored record keeps the downsampled
 * timeline points instead.
 */
export function mergeEvidenceSamples(previousSamples = [], newSamples = []) {
  const seen = new Set(previousSamples.map((s) => s.at));
  return [...previousSamples, ...newSamples.filter((s) => s && !seen.has(s.at))].sort((a, b) => a.at - b.at);
}

/**
 * levelFor(facts, { radius, minDwell }) — the fixed rule set:
 *   FAILED   — mock location reported, OR the device never came within 2× radius
 *   WEAK     — came within 2× radius but never within the radius
 *   MODERATE — within the radius, but dwell < minDwell and no approach/departure movement
 *   STRONG   — within the radius AND (dwell ≥ minDwell OR approach or departure detected)
 */
export function levelFor(facts, { radius, minDwell }) {
  const reasons = [];
  if (facts.mockedDetected) {
    reasons.push('The device reported a mock location.');
    return { level: PRESENCE_LEVEL.FAILED, reasons };
  }
  if (facts.minDistanceM === null || facts.minDistanceM > radius * 2) {
    reasons.push(`Closest recorded distance to the pin was ${facts.minDistanceM === null ? 'unknown' : `${facts.minDistanceM} m`} (radius ${radius} m).`);
    return { level: PRESENCE_LEVEL.FAILED, reasons };
  }
  if (facts.minDistanceM > radius) {
    reasons.push(`Came within ${facts.minDistanceM} m of the pin but not within the ${radius} m radius.`);
    return { level: PRESENCE_LEVEL.WEAK, reasons };
  }
  reasons.push(`Within ${radius} m of the pin (closest ${facts.minDistanceM} m).`);
  reasons.push(`Time within radius: ${facts.dwellSeconds} s (strong result needs ${minDwell} s or movement).`);
  if (facts.approachDetected)  reasons.push('Approach movement recorded before arrival.');
  if (facts.departureDetected) reasons.push('Departure movement recorded after submit.');
  if (facts.dwellSeconds >= minDwell || facts.approachDetected || facts.departureDetected) {
    return { level: PRESENCE_LEVEL.STRONG, reasons };
  }
  reasons.push('No approach or departure movement recorded and dwell time below the minimum.');
  return { level: PRESENCE_LEVEL.MODERATE, reasons };
}

// ---------------------------------------------------------------------------
// Payout risk — presence + duplicates + rate limits
// ---------------------------------------------------------------------------
const normalizeName = (name = '') => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * findDuplicatePlace(candidate, places, radiusMeters) → existing place or null.
 * Duplicate = same normalised name AND within radiusMeters.
 */
export function findDuplicatePlace(candidate, places = [], radiusMeters) {
  const name = normalizeName(candidate.name);
  if (!name) return null;
  const c = { lat: candidate.latitude, lon: candidate.longitude };
  return places.find((p) =>
    p.id !== candidate.id
    && normalizeName(p.name) === name
    && metersBetween(c, { lat: p.latitude, lon: p.longitude }) <= radiusMeters,
  ) || null;
}

/**
 * evaluatePayoutRisk({ evidence, place, places, ledger, userId, settings, now })
 * → { flags, allowCredit, presenceLevel }
 *
 * allowCredit is false when:
 *   • presence is FAILED and presenceBlockCreditOnFailed
 *   • a mock location was reported and presenceBlockCreditOnMocked
 *   • the place duplicates an existing one
 *   • the user reached payoutDailyCapPerUser credited submissions today
 *   • the user's last credited submission was less than payoutCooldownMinutes ago
 * Everything else is a flag for the admin, not a block.
 */
export function evaluatePayoutRisk({ evidence, place, places = [], ledger = [], userId, settings, now = Date.now() }) {
  const flags = [];
  let allowCredit = true;

  if (settings.presenceCheckEnabled) {
    if (!evidence || evidence.level === PRESENCE_LEVEL.UNAVAILABLE) {
      flags.push(RISK_FLAG.PRESENCE_UNAVAILABLE);
    } else if (evidence.level === PRESENCE_LEVEL.FAILED) {
      flags.push(RISK_FLAG.PRESENCE_FAILED);
      if (settings.presenceBlockCreditOnFailed) allowCredit = false;
    } else if (evidence.level === PRESENCE_LEVEL.WEAK) {
      flags.push(RISK_FLAG.PRESENCE_WEAK);
    }
    if (evidence?.mockedDetected) {
      flags.push(RISK_FLAG.MOCK_LOCATION);
      if (settings.presenceBlockCreditOnMocked) allowCredit = false;
    }
  }

  if (findDuplicatePlace(place, places, settings.duplicateRadiusMeters)) {
    flags.push(RISK_FLAG.DUPLICATE_PLACE);
    allowCredit = false;
  }

  const mine = ledger.filter((e) => e.userId === userId && e.status !== 'rejected');
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const today = mine.filter((e) => new Date(e.createdAt).getTime() >= dayStart.getTime());
  if (today.length >= settings.payoutDailyCapPerUser) {
    flags.push(RISK_FLAG.DAILY_CAP);
    allowCredit = false;
  }

  const last = mine.reduce((latest, e) => Math.max(latest, new Date(e.createdAt).getTime()), 0);
  if (last && now - last < settings.payoutCooldownMinutes * 60 * 1000) {
    flags.push(RISK_FLAG.COOLDOWN);
    allowCredit = false;
  }

  return { flags: [...new Set(flags)], allowCredit, presenceLevel: evidence?.level ?? PRESENCE_LEVEL.UNAVAILABLE };
}

// places2go — Co-branding helpers
// Pure functions shared by the admin Co-branding screens and the user-facing
// PartnerBanner. Nothing here reads the store directly.

import { PARTNERSHIP_STATUS } from '../constants/cobranding';
import { CONTENT_VISIBILITY } from '../constants/moderation';
import { buildRatingIndex, EMPTY_RATING, reviewTextVisibility } from './places';

// ---------------------------------------------------------------------------
// Banner resolution — the single place that decides whether users see a banner
// ---------------------------------------------------------------------------
/**
 * getActivePlaceBanner(profile, appSettings)
 * Returns the banner users should see for a place, or null when nothing should
 * be shown. All of these must hold:
 *   • appSettings.cobrandingEnabled is true (admin master switch)
 *   • the partnership status is ACTIVE
 *   • the banner is switched on for the place
 *   • it has at least a headline or one suggested item
 */
export function getActivePlaceBanner(profile, appSettings) {
  if (!appSettings?.cobrandingEnabled) return null;
  if (!profile || profile.status !== PARTNERSHIP_STATUS.ACTIVE) return null;

  const banner = profile.banner;
  if (!banner?.enabled) return null;

  const items    = (banner.items || []).filter((i) => i.name && i.name.trim() !== '');
  const headline = (banner.headline || '').trim();
  if (!headline && items.length === 0) return null;

  const courtesyMessage =
    (banner.courtesyMessage || '').trim() || (appSettings.cobrandingCourtesyMessage || '').trim();

  return {
    placeId:          profile.placeId,
    headline,
    courtesyMessage,
    items,
    showOnDetails:    banner.showOnDetails !== false,
    showOnNavigation: banner.showOnNavigation !== false,
  };
}

/**
 * isBannerLive(profile, appSettings) — convenience for list badges.
 */
export const isBannerLive = (profile, appSettings) => getActivePlaceBanner(profile, appSettings) !== null;

// ---------------------------------------------------------------------------
// Submission insights — what the outreach templates are built from
// ---------------------------------------------------------------------------
/**
 * buildPlaceInsights({ place, reviews, moderationQueue, appSettings, officialAmenities })
 *
 * Everything is computed from the data actually in the store:
 *   reviewCount / averageRating — from this place's reviews (null when none)
 *   confirmedAmenities          — labels of amenities marked true on the place
 *   positiveExcerpts            — visible review text with a rating of 4 or 5
 *   concernExcerpts             — visible review text with a rating of 1 or 2
 * Review text that moderation has hidden or is still reviewing is never used.
 */
export function buildPlaceInsights({
  place,
  reviews = [],
  moderationQueue = [],
  appSettings,
  officialAmenities = [],
}) {
  if (!place) return null;

  const placeReviews = reviews
    .filter((r) => r.placeId === place.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const rating = buildRatingIndex(placeReviews)[place.id] || EMPTY_RATING;

  const confirmedAmenities = officialAmenities
    .filter((a) => a.isActive !== false && place.amenities?.[a.key] === true)
    .map((a) => a.label);

  const visibleText = placeReviews.filter(
    (r) => r.text && reviewTextVisibility(r, moderationQueue, appSettings) === CONTENT_VISIBILITY.VISIBLE,
  );

  return {
    placeId:            place.id,
    hasPublicRestroom:  place.hasPublicRestroom !== false,
    reviewCount:        rating.count,
    averageRating:      rating.count > 0 ? rating.average : null,
    confirmedAmenities,
    positiveExcerpts:   visibleText.filter((r) => r.rating >= 4).map((r) => r.text).slice(0, 3),
    concernExcerpts:    visibleText.filter((r) => r.rating <= 2).map((r) => r.text).slice(0, 3),
    lastReviewedAt:     placeReviews.length ? placeReviews[0].createdAt : null,
    photoCount:         (place.photos || []).length,
  };
}

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------
export function joinList(items = []) {
  const list = items.filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

export function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * buildMailtoUrl({ to, subject, body }) — for Linking.openURL. `to` may be ''.
 */
export function buildMailtoUrl({ to = '', subject = '', body = '' }) {
  const params = [
    subject ? `subject=${encodeURIComponent(subject)}` : null,
    body    ? `body=${encodeURIComponent(body)}`       : null,
  ].filter(Boolean).join('&');
  return `mailto:${encodeURIComponent(to)}${params ? `?${params}` : ''}`;
}

export function buildTelUrl(phone = '') {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function normalizeWebsite(url = '') {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

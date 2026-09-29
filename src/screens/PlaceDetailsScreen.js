// places2go — PlaceDetailsScreen (wireframe #5)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Hero photo (or placeholder) with back / share / save; name, address, open
// state, stars; amenity highlight tiles; full amenity list by group; notes;
// reviews; Get Directions + Rate this place.
//
// Visibility rules: ratings always show; review text and every photo show
// only when moderation says VISIBLE. A contributor's own hidden content shows
// to them with an "Under review" label so they are never confused about
// where it went.

import React, { useCallback, useMemo } from 'react';
import { View, Text, Image, ScrollView, Pressable, Share, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, shadows } from '../theme';
import useStore, { REPORT_VERIFICATION, PAYOUT_STATUS, USER_ROLES } from '../store/useStore';
import useUserLocation from '../hooks/useUserLocation';
import { ROUTES } from '../navigation/routes';
import { AMENITY_GROUP_ORDER, AMENITY_GROUP_LABELS } from '../constants/amenities';
import { CONTENT_VISIBILITY } from '../constants/moderation';
import { isAccessiblePlace, isFamilyFriendlyPlace } from '../constants/filters';
import { distanceMiles, formatDistance } from '../utils/geo';
import { buildRatingIndex, getVisiblePhotos, reviewTextVisibility, getVisibleReviewPhotos, isNoRestroomPlace, isPubliclyListed } from '../utils/places';
import { getActivePlaceBanner } from '../utils/cobranding';
import StarRating from '../components/StarRating';
import PrimaryButton from '../components/PrimaryButton';
import PartnerBanner from '../components/PartnerBanner';

const HERO_HEIGHT = 240;

// The four highlight tiles under the header (wireframe: Very Clean / Accessible / Family Friendly / Single Stalls)
const HIGHLIGHTS = [
  { key: 'clean',  label: 'Clean',           icon: 'sparkles-outline',      test: (p) => p.amenities?.isClean === true },
  { key: 'access', label: 'Accessible',      icon: 'accessibility-outline', test: isAccessiblePlace },
  { key: 'family', label: 'Family Friendly', icon: 'people-outline',        test: isFamilyFriendlyPlace },
  { key: 'single', label: 'Single Stall',    icon: 'person-outline',        test: (p) => p.amenities?.isSingleOccupancy === true },
  { key: 'free',   label: 'Free',            icon: 'cash-outline',          test: (p) => p.amenities?.isFree === true },
  { key: 'hours',  label: '24 Hours',        icon: 'time-outline',          test: (p) => p.amenities?.isOpen24Hours === true },
];

const formatDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function PlaceDetailsScreen({ navigation, route }) {
  const insets  = useSafeAreaInsets();
  const placeId = route.params?.placeId;

  const place             = useStore((s) => s.places.find((p) => p.id === placeId) || null);
  const reviews           = useStore((s) => s.reviews);
  const moderationQueue   = useStore((s) => s.moderationQueue);
  const appSettings       = useStore((s) => s.appSettings);
  const officialAmenities = useStore((s) => s.officialAmenities);
  const currentUser       = useStore((s) => s.currentUser);
  const savedPlaceIds     = useStore((s) => s.savedPlaceIds);
  const toggleSavedPlace  = useStore((s) => s.toggleSavedPlace);
  const releaseReviewLock = useStore((s) => s.releaseReviewLock);
  const removePlace       = useStore((s) => s.removePlace);
  const coBrandingProfile = useStore((s) => s.coBranding[placeId] || null);
  const payoutLedger      = useStore((s) => s.payoutLedger);

  const { location } = useUserLocation();

  const noRestroom = isNoRestroomPlace(place);
  const banner     = useMemo(() => getActivePlaceBanner(coBrandingProfile, appSettings), [coBrandingProfile, appSettings]);
  const reportCredit = useMemo(
    () => (place && noRestroom ? payoutLedger.find((e) => e.placeId === place.id && e.kind === 'no_restroom_report') || null : null),
    [payoutLedger, place, noRestroom],
  );

  const isSaved   = savedPlaceIds.includes(placeId);
  const rating    = useMemo(() => buildRatingIndex(reviews)[placeId] || { average: 0, count: 0 }, [reviews, placeId]);
  const distance  = place && location ? formatDistance(distanceMiles(location, place)) : null;

  const placeReviews = useMemo(
    () => reviews.filter((r) => r.placeId === placeId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [reviews, placeId],
  );

  const visiblePhotos = useMemo(
    () => (place ? getVisiblePhotos(place, moderationQueue, appSettings) : []),
    [place, moderationQueue, appSettings],
  );
  const ownPendingPhotos = useMemo(
    () => (place && place.contributorId === currentUser.id
      ? place.photos.filter((p) => !visiblePhotos.includes(p))
      : []),
    [place, currentUser.id, visiblePhotos],
  );

  const highlights = useMemo(() => (place ? HIGHLIGHTS.filter((h) => h.test(place)).slice(0, 4) : []), [place]);

  const amenityGroups = useMemo(() => {
    if (!place) return [];
    return AMENITY_GROUP_ORDER.map((group) => ({
      key:   group,
      label: AMENITY_GROUP_LABELS[group],
      items: officialAmenities.filter((a) => a.group === group && place.amenities?.[a.key] === true),
    })).filter((g) => g.items.length > 0);
  }, [place, officialAmenities]);

  const handleShare = useCallback(async () => {
    if (!place) return;
    try {
      await Share.share({ message: `${place.name}${place.address ? ` — ${place.address}` : ''} (via places2go)` });
    } catch (err) {
      // user dismissed the share sheet; nothing to do
    }
  }, [place]);

  if (!place || !isPubliclyListed(place, currentUser.id)) {
    return (
      <View style={[styles.missing, { paddingTop: insets.top }]}>
        <Text style={typography.subheading}>{place ? 'This listing is no longer available' : 'Place not found'}</Text>
        {place ? <Text style={styles.missingCaption}>The report for this address could not be verified and has been removed from the map.</Text> : null}
        <PrimaryButton label="Go back" variant="secondary" onPress={() => navigation.goBack()} style={styles.missingButton} />
      </View>
    );
  }

  const isOwnReport = noRestroom && place.contributorId === currentUser.id;
  const isContributor = place.contributorId === currentUser.id;
  const isAdmin       = currentUser.role === USER_ROLES.ADMIN;
  const lockedForMe   = !!place.reviewLock && place.reviewLock.lockedToUserId !== currentUser.id;

  const confirmRelease = () =>
    Alert.alert('Open to reviews?', 'Anyone who visits will be able to rate and review this place.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open it up', onPress: () => { try { releaseReviewLock(placeId); } catch (err) { Alert.alert(err.message); } } },
    ]);
  const confirmRemove = () =>
    Alert.alert('Remove this place?', 'It disappears from the map along with its reviews. A pending credit for it is cancelled.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { try { removePlace(placeId); navigation.goBack(); } catch (err) { Alert.alert(err.message); } } },
    ]);
  const reportStatus = noRestroom
    ? place.reportVerification === REPORT_VERIFICATION.VERIFIED
      ? { label: 'Verified by an administrator', bg: colors.modCleanBg, text: colors.modCleanText, icon: 'shield-checkmark-outline' }
      : place.reportVerification === REPORT_VERIFICATION.REJECTED
        ? { label: 'Could not be verified', bg: colors.modRejectedBg, text: colors.modRejectedText, icon: 'close-circle-outline' }
        : { label: 'Reported · awaiting verification', bg: colors.modPendingBg, text: colors.modPendingText, icon: 'time-outline' }
    : null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}>
        {/* Hero */}
        <View style={styles.hero}>
          {visiblePhotos.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {visiblePhotos.map((p) => (
                <Image key={p.id} source={{ uri: p.uploadedUrl }} style={styles.heroImage} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Ionicons name="image-outline" size={36} color={colors.textSecondary} />
              <Text style={styles.heroPlaceholderText}>No photos yet</Text>
            </View>
          )}
          <View style={[styles.heroBar, { top: insets.top + spacing.sm }]}>
            <Pressable onPress={() => navigation.goBack()} style={styles.heroButton} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <View style={styles.heroRight}>
              <Pressable onPress={handleShare} style={styles.heroButton} accessibilityRole="button" accessibilityLabel="Share">
                <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
              </Pressable>
              <Pressable
                onPress={() => toggleSavedPlace(placeId)}
                style={styles.heroButton}
                accessibilityRole="button"
                accessibilityLabel={isSaved ? 'Remove from saved' : 'Save place'}
              >
                <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={20} color={isSaved ? colors.accent : colors.textPrimary} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {/* Header */}
          <View style={styles.titleRow}>
            <Text style={styles.name}>{place.name}</Text>
            {noRestroom ? (
              <View style={[styles.verified, styles.noRestroomBadge]}>
                <Ionicons name="close" size={12} color={colors.textOnDark} />
                <Text style={styles.verifiedText}>No public restroom</Text>
              </View>
            ) : place.verified ? (
              <View style={styles.verified}>
                <Ionicons name="checkmark" size={12} color={colors.textOnDark} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : null}
          </View>
          {place.address ? <Text style={styles.address}>{place.address}</Text> : null}
          {noRestroom ? (
            <>
              <Text style={styles.meta}>{distance ? `${distance} · ` : ''}Reported {formatDate(place.createdAt)}</Text>
              <View style={[styles.reportStatus, { backgroundColor: reportStatus.bg }]}>
                <Ionicons name={reportStatus.icon} size={16} color={reportStatus.text} />
                <Text style={[styles.reportStatusText, { color: reportStatus.text }]}>{reportStatus.label}</Text>
              </View>
              <Text style={styles.reportExplain}>
                A visitor reported that this address has no restroom open to the public
                {place.verifiedAt ? `; an administrator ${place.reportVerification === REPORT_VERIFICATION.VERIFIED ? 'confirmed' : 'reviewed'} it on ${formatDate(place.verifiedAt)}` : ''}.
                Conditions can change — if you find one here, add it as a new place.
              </Text>
              {isOwnReport && reportCredit ? (
                <View style={styles.notice}>
                  <Ionicons name="wallet-outline" size={16} color={colors.textPrimary} />
                  <Text style={[styles.noticeText, { color: colors.textPrimary }]}>
                    Your ${reportCredit.amount.toFixed(2)} credit for this report is {reportCredit.status === PAYOUT_STATUS.PENDING ? 'pending admin verification' : reportCredit.status === PAYOUT_STATUS.APPROVED ? 'approved' : reportCredit.status === PAYOUT_STATUS.PAID ? 'paid' : 'not approved'}.
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.meta}>
                {distance ? `${distance} · ` : ''}
                <Text style={place.isOpen ? styles.open : styles.closed}>{place.isOpen ? 'Open' : 'Closed'}</Text>
                {place.hoursLabel ? ` · ${place.hoursLabel.replace(/^(Open|Closed)\s*·\s*/i, '')}` : ''}
              </Text>
              <View style={styles.ratingRow}>
                <StarRating rating={rating.average} size={16} />
                <Text style={styles.ratingText}>
                  {rating.count > 0 ? `${rating.average.toFixed(1)} (${rating.count})` : 'No reviews yet'}
                </Text>
              </View>
            </>
          )}

          {/* Highlights */}
          {highlights.length > 0 ? (
            <View style={styles.highlights}>
              {highlights.map((h) => (
                <View key={h.key} style={styles.highlight}>
                  <Ionicons name={h.icon} size={22} color={colors.primary} />
                  <Text style={styles.highlightText}>{h.label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Partner message (active partners only) */}
          {banner && banner.showOnDetails ? <PartnerBanner banner={banner} style={styles.partner} /> : null}

          {/* Review lock */}
          {place.reviewLock ? (
            <View style={styles.notice}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.modUnderReviewText} />
              <Text style={styles.noticeText}>
                {isContributor
                  ? 'Only you can review this place until you open it up to everyone.'
                  : 'Reviews are open only to the person who added this place until they, or an administrator, release it.'}
              </Text>
            </View>
          ) : null}
          {(isContributor || isAdmin) && (place.reviewLock || isContributor || isAdmin) ? (
            <View style={styles.ownerActions}>
              {place.reviewLock ? <Text style={styles.ownerLink} onPress={confirmRelease}>Open to reviews</Text> : null}
              <Text style={[styles.ownerLink, styles.ownerLinkDanger]} onPress={confirmRemove}>{isContributor ? 'Remove my submission' : 'Remove place (admin)'}</Text>
            </View>
          ) : null}

          {/* Own pending photos */}
          {ownPendingPhotos.length > 0 ? (
            <View style={styles.notice}>
              <Ionicons name="time-outline" size={16} color={colors.modUnderReviewText} />
              <Text style={styles.noticeText}>
                {ownPendingPhotos.length} of your photo{ownPendingPhotos.length === 1 ? ' is' : 's are'} under review or not yet uploaded.
              </Text>
            </View>
          ) : null}

          {/* Notes */}
          {place.notes ? (
            <>
              <Text style={styles.sectionTitle}>Notes</Text>
              <Text style={styles.notes}>{place.notes}</Text>
            </>
          ) : null}

          {/* Amenities */}
          {amenityGroups.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Amenities</Text>
              {amenityGroups.map((g) => (
                <View key={g.key} style={styles.amenityGroup}>
                  <Text style={styles.amenityGroupTitle}>{g.label}</Text>
                  <View style={styles.amenityChips}>
                    {g.items.map((a) => (
                      <View key={a.key} style={styles.amenityChip}>
                        <Ionicons name="checkmark" size={12} color={colors.success} />
                        <Text style={styles.amenityChipText}>{a.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </>
          ) : null}

          {/* Reviews */}
          {noRestroom ? null : <Text style={styles.sectionTitle}>Reviews</Text>}
          {noRestroom ? null : placeReviews.length === 0 ? (
            <Text style={styles.emptyReviews}>Be the first to review this place.</Text>
          ) : (
            placeReviews.map((r) => {
              const textVis   = reviewTextVisibility(r, moderationQueue, appSettings);
              const isOwn     = r.userId === currentUser.id;
              const showText  = r.text && (textVis === CONTENT_VISIBILITY.VISIBLE || isOwn);
              const photos    = getVisibleReviewPhotos(r, moderationQueue, appSettings);
              return (
                <View key={r.id} style={styles.review}>
                  <View style={styles.reviewHead}>
                    <StarRating rating={r.rating} size={13} />
                    <Text style={styles.reviewDate}>{formatDate(r.createdAt)}</Text>
                  </View>
                  {showText ? (
                    <Text style={styles.reviewText}>"{r.text}"</Text>
                  ) : r.text ? (
                    <Text style={styles.reviewHidden}>Review text hidden.</Text>
                  ) : null}
                  {isOwn && r.text && textVis !== CONTENT_VISIBILITY.VISIBLE ? (
                    <Text style={styles.reviewPending}>Your review is under moderation review and is only visible to you.</Text>
                  ) : null}
                  {photos.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewPhotos}>
                      {photos.map((p) => (
                        <Image key={p.id} source={{ uri: p.uploadedUrl }} style={styles.reviewPhoto} resizeMode="cover" />
                      ))}
                    </ScrollView>
                  ) : null}
                  <Text style={styles.reviewAuthor}>— {isOwn ? 'You' : 'Verified user'}</Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Sticky actions */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.md }]}>
        {noRestroom ? (
          <PrimaryButton
            label="Add a restroom here instead"
            variant="secondary"
            onPress={() => navigation.navigate(ROUTES.ADD_PLACE)}
            style={styles.actionButton}
          />
        ) : (
          <PrimaryButton
            label={lockedForMe ? 'Reviews not open yet' : 'Rate this place'}
            variant="secondary"
            disabled={lockedForMe}
            onPress={() => navigation.navigate(ROUTES.RATE_REVIEW, { placeId })}
            style={styles.actionButton}
          />
        )}
        <PrimaryButton
          label="Get Directions"
          onPress={() => navigation.navigate(ROUTES.NAVIGATION, { placeId })}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hero: { height: HERO_HEIGHT, backgroundColor: colors.surface },
  heroImage: { width: '100%', height: HERO_HEIGHT },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  heroPlaceholderText: { ...typography.label },
  heroBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, flexDirection: 'row', justifyContent: 'space-between' },
  heroRight: { flexDirection: 'row', gap: spacing.sm },
  heroButton: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { ...typography.title, flexShrink: 1 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.success, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  verifiedText: { ...typography.badge, color: colors.textOnDark },
  noRestroomBadge: { backgroundColor: colors.pinNoRestroom },
  reportStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, marginTop: spacing.sm },
  reportStatusText: { ...typography.captionMedium },
  reportExplain: { ...typography.caption, marginTop: spacing.sm },
  partner: { marginTop: spacing.lg },
  ownerActions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  ownerLink: { ...typography.captionMedium, color: colors.primary, paddingVertical: spacing.xs },
  ownerLinkDanger: { color: colors.modRejectedText },
  missingCaption: { ...typography.caption, textAlign: 'center', marginTop: spacing.sm },
  address: { ...typography.caption, marginTop: 2 },
  meta: { ...typography.caption, marginTop: 2 },
  open: { color: colors.success },
  closed: { color: colors.textSecondary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  ratingText: { ...typography.captionMedium },
  highlights: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  highlight: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', gap: spacing.xs },
  highlightText: { ...typography.label, color: colors.textPrimary, textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.modUnderReviewBg, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  noticeText: { ...typography.caption, color: colors.modUnderReviewText, flex: 1 },
  sectionTitle: { ...typography.subheading, marginTop: spacing.xl, marginBottom: spacing.sm },
  notes: { ...typography.body },
  amenityGroup: { marginBottom: spacing.md },
  amenityGroupTitle: { ...typography.label, marginBottom: spacing.xs },
  amenityChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  amenityChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
  amenityChipText: { ...typography.caption, color: colors.textPrimary },
  emptyReviews: { ...typography.caption },
  review: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewDate: { ...typography.label },
  reviewText: { ...typography.body, marginTop: spacing.sm },
  reviewHidden: { ...typography.caption, marginTop: spacing.sm, fontStyle: 'italic' },
  reviewPending: { ...typography.label, color: colors.modUnderReviewText, marginTop: spacing.xs },
  reviewPhotos: { gap: spacing.sm, marginTop: spacing.sm },
  reviewPhoto: { width: 72, height: 72, borderRadius: radius.sm },
  reviewAuthor: { ...typography.label, marginTop: spacing.sm },
  actions: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.background, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  actionButton: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  missingButton: { marginTop: spacing.lg, alignSelf: 'stretch' },
});

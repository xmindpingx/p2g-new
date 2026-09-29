// places2go — PlaceDetailsScreen (wireframe #5)
// Hero photo (or placeholder) with back / share / save; name, address, open
// state, stars; amenity highlight tiles; full amenity list by group; notes;
// reviews; Get Directions + Rate this place.
//
// Visibility rules: ratings always show; review text and every photo show
// only when moderation says VISIBLE. A contributor's own hidden content shows
// to them with an "Under review" label so they are never confused about
// where it went.

import React, { useCallback, useMemo } from 'react';
import { View, Text, Image, ScrollView, Pressable, Share, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, shadows } from '../theme';
import useStore from '../store/useStore';
import useUserLocation from '../hooks/useUserLocation';
import { ROUTES } from '../navigation/routes';
import { AMENITY_GROUP_ORDER, AMENITY_GROUP_LABELS } from '../constants/amenities';
import { CONTENT_VISIBILITY } from '../constants/moderation';
import { isAccessiblePlace, isFamilyFriendlyPlace } from '../constants/filters';
import { distanceMiles, formatDistance } from '../utils/geo';
import { buildRatingIndex, getVisiblePhotos, reviewTextVisibility, getVisibleReviewPhotos } from '../utils/places';
import StarRating from '../components/StarRating';
import PrimaryButton from '../components/PrimaryButton';

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

  const { location } = useUserLocation();

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

  if (!place) {
    return (
      <View style={[styles.missing, { paddingTop: insets.top }]}>
        <Text style={typography.subheading}>Place not found</Text>
        <PrimaryButton label="Go back" variant="secondary" onPress={() => navigation.goBack()} style={styles.missingButton} />
      </View>
    );
  }

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
            {place.verified ? (
              <View style={styles.verified}>
                <Ionicons name="checkmark" size={12} color={colors.textOnDark} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : null}
          </View>
          {place.address ? <Text style={styles.address}>{place.address}</Text> : null}
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
          <Text style={styles.sectionTitle}>Reviews</Text>
          {placeReviews.length === 0 ? (
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
        <PrimaryButton
          label="Rate this place"
          variant="secondary"
          onPress={() => navigation.navigate(ROUTES.RATE_REVIEW, { placeId })}
          style={styles.actionButton}
        />
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

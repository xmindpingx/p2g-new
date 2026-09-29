// places2go — RateReviewScreen (wireframe #7)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Stars → "How was the restroom?" → amenity snapshot → text → photo → Submit.
//
// If the reviewer is the place's contributor and the place hasn't been
// credited yet, a live checklist shows exactly what the review needs to earn
// the contributor credit (thresholds come from appSettings so admin changes
// apply instantly). The checklist is a plain status readout — no badges,
// no celebration, nothing beyond the payout itself.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { showAlert } from '../utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, fonts, fontSizes } from '../theme';
import useStore from '../store/useStore';
import useVisitEvidence from '../hooks/useVisitEvidence';
import { ROUTES } from '../navigation/routes';
import { uploadPhoto, isUploadConfigured } from '../services/uploads';
import { AMENITY_KEY_SET } from '../constants/amenities';
import StarRatingInput from '../components/StarRatingInput';
import AmenityPicker from '../components/AmenityPicker';
import PhotoPicker from '../components/PhotoPicker';
import SectionHeader from '../components/SectionHeader';
import PrimaryButton from '../components/PrimaryButton';
import PresenceStatusCard from '../components/PresenceStatusCard';

const TEXT_MAX = 500;

export default function RateReviewScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { placeId, fromAddPlace = false } = route.params || {};

  const place                         = useStore((s) => s.places.find((p) => p.id === placeId) || null);
  const currentUser                   = useStore((s) => s.currentUser);
  const appSettings                   = useStore((s) => s.appSettings);
  const addReview                     = useStore((s) => s.addReview);
  const updateReviewPhotoUploadStatus = useStore((s) => s.updateReviewPhotoUploadStatus);
  const markPhotoUploadFailed         = useStore((s) => s.markPhotoUploadFailed);

  const [rating, setRating]       = useState(0);
  const [amenities, setAmenities] = useState({});
  const [text, setText]           = useState('');
  const [photos, setPhotos]       = useState([]);
  const [feltUnsafe, setFeltUnsafe] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Review lock: a newly added place accepts reviews only from its contributor
  const locked = !!place?.reviewLock && place.reviewLock.lockedToUserId !== currentUser.id;

  const maxPhotos = appSettings.maxPhotosPerReview;

  // ── GPS confirmation: reviews are accepted only while at the place ────────
  const target   = place ? { latitude: place.latitude, longitude: place.longitude } : null;
  const presence = useVisitEvidence({ target, active: !!place && place.hasPublicRestroom !== false });

  // ── Payout eligibility (contributor only) ─────────────────────────────────
  const isContributor  = !!place && place.contributorId === currentUser.id && place.payoutCredited === false;
  const checkedCount   = useMemo(
    () => Object.entries(amenities).filter(([k, v]) => v === true && AMENITY_KEY_SET.has(k)).length,
    [amenities],
  );
  const textLength     = text.trim().length;
  const checks = useMemo(() => ([
    { key: 'rating', label: 'Choose a star rating',                                            done: rating >= 1 },
    { key: 'text',   label: `Write at least ${appSettings.reviewMinTextLength} characters`,     done: textLength >= appSettings.reviewMinTextLength },
    { key: 'amen',   label: `Mark at least ${appSettings.reviewMinAmenityChecks} amenities`,    done: checkedCount >= appSettings.reviewMinAmenityChecks },
  ]), [rating, textLength, checkedCount, appSettings.reviewMinTextLength, appSettings.reviewMinAmenityChecks]);
  const qualifies = checks.every((c) => c.done);

  // ── Submit ────────────────────────────────────────────────────────────────
  const uploadAll = useCallback(async (review) => {
    if (!isUploadConfigured() || review.photos.length === 0) return { failed: 0 };
    let failed = 0;
    for (const photo of review.photos) {
      try {
        const { url } = await uploadPhoto({
          localUri:    photo.localUri,
          photoId:     photo.id,
          placeId:     review.placeId,
          submittedBy: currentUser.id,
        });
        updateReviewPhotoUploadStatus(review.id, photo.id, url);
      } catch (err) {
        markPhotoUploadFailed({ reviewId: review.id, photoId: photo.id });
        failed += 1;
      }
    }
    return { failed };
  }, [currentUser.id, updateReviewPhotoUploadStatus, markPhotoUploadFailed]);

  const handleSubmit = useCallback(async () => {
    if (rating < 1) { showAlert('Add a rating', 'Tap a star to rate this restroom.'); return; }
    if (!presence.submitAllowed) {
      showAlert("We can't confirm you're here yet", 'Reviews can only be left while you are at the place. See the location status at the top of this screen.');
      return;
    }
    setSubmitting(true);
    try {
      const { review, payout } = addReview({
        placeId,
        rating,
        text,
        amenities,
        photos: photos.map((p) => ({ localUri: p.localUri })),
        presenceDistanceM: presence.distanceM,
        feltUnsafe,
      });
      presence.discard();
      const { failed } = await uploadAll(review);

      const lines = [];
      if (payout) lines.push(`A $${payout.amount.toFixed(2)} contributor credit is pending review.`);
      if (failed > 0) lines.push(`${failed} photo${failed === 1 ? '' : 's'} failed to upload; retry from the place page.`);

      const finish = () => {
        if (fromAddPlace) {
          navigation.replace(ROUTES.PLACE_DETAILS, { placeId });
        } else {
          navigation.goBack();
        }
      };

      if (lines.length) showAlert('Review submitted', lines.join('\n\n'), [{ text: 'OK', onPress: finish }]);
      else finish();
    } catch (err) {
      showAlert('Could not submit review', err.message);
    } finally {
      setSubmitting(false);
    }
  }, [rating, presence, addReview, placeId, text, amenities, photos, feltUnsafe, uploadAll, fromAddPlace, navigation]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (!place) {
    return (
      <View style={styles.missing}>
        <Text style={typography.subheading}>Place not found</Text>
        <PrimaryButton label="Go back" variant="secondary" onPress={() => navigation.goBack()} style={styles.missingButton} />
      </View>
    );
  }

  if (locked) {
    return (
      <View style={styles.missing}>
        <Ionicons name="lock-closed-outline" size={36} color={colors.textSecondary} />
        <Text style={[typography.subheading, styles.missingTitle]}>Not open for reviews yet</Text>
        <Text style={styles.missingCaption}>
          The person who added this place is completing their own review first. Reviews from everyone open up once they release the place, or an administrator does.
        </Text>
        <PrimaryButton label="Go back" variant="secondary" onPress={() => navigation.goBack()} style={styles.missingButton} />
      </View>
    );
  }

  if (place.hasPublicRestroom === false) {
    return (
      <View style={styles.missing}>
        <Ionicons name="close-circle-outline" size={36} color={colors.textSecondary} />
        <Text style={[typography.subheading, styles.missingTitle]}>No public restroom here</Text>
        <Text style={styles.missingCaption}>
          This address is listed as having no public restroom, so it cannot be rated. If that has changed, add it as a new place.
        </Text>
        <PrimaryButton label="Go back" variant="secondary" onPress={() => navigation.goBack()} style={styles.missingButton} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
        {place.address ? <Text style={styles.placeAddress} numberOfLines={1}>{place.address}</Text> : null}

        {appSettings.requirePresenceToSubmit ? (
          <PresenceStatusCard
            confirmation={presence.confirmation}
            distanceM={presence.distanceM}
            radiusM={presence.radiusM}
            placeLabel={place.name}
            onRetry={presence.retry}
            style={styles.presence}
          />
        ) : null}

        <StarRatingInput value={rating} onChange={setRating} style={styles.stars} />
        <Text style={styles.prompt}>How was the restroom?</Text>

        {isContributor ? (
          <View style={styles.eligibility}>
            <Text style={styles.eligibilityTitle}>
              Contributor credit · ${appSettings.payoutAmountUSD.toFixed(2)}
            </Text>
            {checks.map((c) => (
              <View key={c.key} style={styles.checkRow}>
                <Ionicons
                  name={c.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={c.done ? colors.success : colors.textSecondary}
                />
                <Text style={[styles.checkLabel, c.done && styles.checkDone]}>{c.label}</Text>
              </View>
            ))}
            <Text style={styles.eligibilityCaption}>
              {qualifies
                ? 'This review qualifies. Credit is recorded as pending once you submit.'
                : 'Complete the items above to qualify.'}
            </Text>
          </View>
        ) : null}

        <SectionHeader title="What did it have?" caption={checkedCount > 0 ? `${checkedCount} marked` : null} />
        <AmenityPicker value={amenities} onChange={setAmenities} compact />

        <SectionHeader title="Share your experience (optional)" caption={`${textLength} / ${TEXT_MAX}`} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Clean? Easy to find? Anything to know before you go?"
          placeholderTextColor={colors.placeholder}
          multiline
          maxLength={TEXT_MAX}
          style={styles.textArea}
          textAlignVertical="top"
          accessibilityLabel="Review text"
        />

        <SectionHeader title="Add a photo (optional)" caption={`${photos.length} / ${maxPhotos}`} />
        <PhotoPicker photos={photos} onChange={setPhotos} max={maxPhotos} />

        <Pressable onPress={() => setFeltUnsafe((v) => !v)} style={styles.unsafeRow} accessibilityRole="checkbox" accessibilityState={{ checked: feltUnsafe }}>
          <Ionicons name={feltUnsafe ? 'checkbox' : 'square-outline'} size={22} color={feltUnsafe ? colors.primary : colors.textSecondary} />
          <View style={styles.unsafeText}>
            <Text style={styles.unsafeTitle}>I felt unsafe here</Text>
            <Text style={styles.unsafeCaption}>Marks this place with a safety flag on the map once enough visitors report it.</Text>
          </View>
        </Pressable>

        <PrimaryButton
          label="Submit Review"
          onPress={handleSubmit}
          disabled={rating < 1 || !presence.submitAllowed}
          loading={submitting}
          style={styles.submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.md,
  },
  placeName: {
    ...typography.subheading,
    textAlign: 'center',
  },
  presence: {
    marginTop: spacing.md,
  },
  unsafeRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           spacing.sm,
    marginTop:     spacing.xl,
  },
  unsafeText:    { flex: 1 },
  unsafeTitle:   { ...typography.bodyMedium },
  unsafeCaption: { ...typography.label, marginTop: 2 },
  missingTitle: {
    marginTop: spacing.md,
  },
  missingCaption: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  placeAddress: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: 2,
  },
  stars: {
    marginTop: spacing.xl,
  },
  prompt: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  eligibility: {
    marginTop:       spacing.xl,
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    padding:         spacing.lg,
    gap:             spacing.sm,
  },
  eligibilityTitle: {
    ...typography.bodyMedium,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  checkLabel: {
    ...typography.caption,
  },
  checkDone: {
    color: colors.textPrimary,
  },
  eligibilityCaption: {
    ...typography.label,
    marginTop: spacing.xs,
  },
  textArea: {
    height:            120,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    fontFamily:        fonts.regular,
    fontSize:          fontSizes.md,
    color:             colors.textPrimary,
  },
  submit: {
    marginTop: spacing.xl,
  },
  missing: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         spacing.xl,
    backgroundColor: colors.background,
  },
  missingButton: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
});

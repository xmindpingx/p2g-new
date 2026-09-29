// places2go — AddPlaceScreen (wireframe #8)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Search or enter address → what you found (restroom / no public restroom) →
// photos → place type → amenities → notes → submit.
//
// Before the first submission the contributor confirms the safety
// acknowledgment (Contributor Terms). Every submission needs a GPS
// confirmation that the device is at the address; if that cannot be confirmed
// the screen explains why and links to location settings.
//
// Flow on submit:
//   1. dropPin() stores the place with the recorded presence evidence.
//   2. Photos upload; each success enqueues the photo for AI moderation.
//   3. Restroom: go to Rate & Review so the contributor can earn the credit.
//      No-restroom report: back to the map; the credit is pending admin
//      verification.
//   4. visitTracker keeps sampling briefly so the departure is recorded.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { showAlert } from '../utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, fonts, fontSizes } from '../theme';
import useStore, { PLACE_TYPES } from '../store/useStore';
import useUserLocation from '../hooks/useUserLocation';
import useVisitEvidence from '../hooks/useVisitEvidence';
import { ROUTES } from '../navigation/routes';
import { reverseGeocode } from '../services/nominatim';
import { uploadPhoto, isUploadConfigured } from '../services/uploads';
import { LEGAL_VERSION, LEGAL_DOCS, renderContributorAckPoints } from '../constants/legal';
import AddressAutosuggest from '../components/AddressAutosuggest';
import PhotoPicker from '../components/PhotoPicker';
import AmenityPicker from '../components/AmenityPicker';
import SuggestAmenitySheet from '../components/SuggestAmenitySheet';
import SectionHeader from '../components/SectionHeader';
import PrimaryButton from '../components/PrimaryButton';
import PresenceStatusCard from '../components/PresenceStatusCard';
import { Chip } from '../components/FilterChips';

const NOTES_MAX = 300;

const AVAILABILITY = [
  { key: 'restroom',   label: 'Public restroom',    icon: 'checkmark-circle-outline' },
  { key: 'none',       label: 'No public restroom', icon: 'close-circle-outline' },
];

export default function AddPlaceScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const appSettings             = useStore((s) => s.appSettings);
  const currentUser             = useStore((s) => s.currentUser);
  const contributorAcceptance   = useStore((s) => s.contributorAcceptance);
  const acceptContributorTerms  = useStore((s) => s.acceptContributorTerms);
  const dropPin                 = useStore((s) => s.dropPin);
  const updatePhotoUploadStatus = useStore((s) => s.updatePhotoUploadStatus);
  const markPhotoUploadFailed   = useStore((s) => s.markPhotoUploadFailed);

  const { location } = useUserLocation();

  // ── Form state ────────────────────────────────────────────────────────────
  const [availability, setAvailability] = useState('restroom');
  const [reason, setReason]             = useState('not_public'); // 'not_public' (red) | 'none_on_site' (black)
  const [addressText, setAddressText]   = useState('');
  const [selected, setSelected]         = useState(null); // normalised Nominatim result
  const [name, setName]                 = useState('');
  const [photos, setPhotos]             = useState([]);
  const [placeType, setPlaceType]       = useState(PLACE_TYPES[0]);
  const [amenities, setAmenities]       = useState({});
  const [customIds, setCustomIds]       = useState([]);
  const [notes, setNotes]               = useState('');
  const [suggestGroup, setSuggestGroup] = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [locating, setLocating]         = useState(false);
  const [ackChecked, setAckChecked]     = useState(false);
  const [markingSpot, setMarkingSpot]   = useState(false);

  const isReport  = availability === 'none';
  const maxPhotos = appSettings.maxPhotosPerPlace;

  const ackNeeded = !contributorAcceptance || contributorAcceptance.version !== LEGAL_VERSION;
  const ackPoints = useMemo(() => renderContributorAckPoints(appSettings), [appSettings]);

  // ── Presence (GPS confirmation + evidence) ────────────────────────────────
  const target   = selected ? { latitude: selected.latitude, longitude: selected.longitude } : null;
  const presence = useVisitEvidence({ target, active: true });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectAddress = useCallback((result) => {
    setSelected(result);
    setAddressText(result.formattedAddress || result.displayName);
    if (!name.trim() && result.name) setName(result.name);
  }, [name]);

  const handleUseMyLocation = useCallback(async () => {
    if (!location) {
      showAlert('Location unavailable', 'Turn on location services to use your current position.');
      return;
    }
    setLocating(true);
    try {
      const result = await reverseGeocode(location.latitude, location.longitude);
      if (result) {
        handleSelectAddress({ ...result, latitude: location.latitude, longitude: location.longitude });
      } else {
        setSelected({ latitude: location.latitude, longitude: location.longitude, formattedAddress: '', name: null });
        setAddressText('Current location');
      }
    } catch (err) {
      showAlert('Address lookup failed', 'Your position was saved without a street address.');
      setSelected({ latitude: location.latitude, longitude: location.longitude, formattedAddress: '', name: null });
      setAddressText('Current location');
    } finally {
      setLocating(false);
    }
  }, [location, handleSelectAddress]);

  const handleAddressTextChange = useCallback((text) => {
    setAddressText(text);
    if (selected) setSelected(null); // typing again invalidates the chosen coordinates
  }, [selected]);

  const handleMarkSpot = useCallback(async () => {
    setMarkingSpot(true);
    const fix = await presence.markRestroomFix();
    setMarkingSpot(false);
    if (!fix) showAlert("Couldn't read your position", 'Try again in a moment, ideally near a window or doorway.');
  }, [presence]);

  const validation = useMemo(() => {
    if (!name.trim())              return 'Give the place a name.';
    if (!selected)                 return 'Pick an address from the suggestions.';
    if (photos.length > maxPhotos) return `You can add up to ${maxPhotos} photos.`;
    if (ackNeeded && !ackChecked)  return 'Please confirm the contributor acknowledgment.';
    if (!presence.submitAllowed)   return 'We need to confirm you are at this address (see above).';
    return null;
  }, [name, selected, photos.length, maxPhotos, ackNeeded, ackChecked, presence.submitAllowed]);

  const uploadAll = useCallback(async (place) => {
    if (!isUploadConfigured() || place.photos.length === 0) return { ok: 0, failed: 0, skipped: place.photos.length };
    let ok = 0, failed = 0;
    for (const photo of place.photos) {
      try {
        const { url } = await uploadPhoto({
          localUri:    photo.localUri,
          photoId:     photo.id,
          placeId:     place.id,
          submittedBy: currentUser.id,
        });
        updatePhotoUploadStatus(place.id, photo.id, url);
        ok += 1;
      } catch (err) {
        markPhotoUploadFailed({ placeId: place.id, photoId: photo.id });
        failed += 1;
      }
    }
    return { ok, failed, skipped: 0 };
  }, [currentUser.id, updatePhotoUploadStatus, markPhotoUploadFailed]);

  const handleSubmit = useCallback(async () => {
    if (validation) { showAlert('Almost there', validation); return; }
    setSubmitting(true);
    try {
      if (ackNeeded) acceptContributorTerms(LEGAL_VERSION);

      const place = dropPin({
        name,
        address:   selected.formattedAddress || addressText,
        latitude:  selected.latitude,
        longitude: selected.longitude,
        placeType,
        amenities:        isReport ? {} : amenities,
        customAmenityIds: isReport ? [] : customIds,
        notes,
        photos: photos.map((p) => ({ localUri: p.localUri })),
        hasPublicRestroom: !isReport,
        noRestroomReason:  reason,
        visitSamples:      presence.getSamples(),
        restroomFix:       presence.restroomFix,
        presenceDistanceM: presence.distanceM,
      });

      // Keep recording briefly so the departure shows in the evidence.
      presence.continueAfterSubmit(place.id);

      const upload = await uploadAll(place);

      const next = () => {
        if (isReport) {
          navigation.replace(ROUTES.PLACE_DETAILS, { placeId: place.id });
        } else {
          navigation.replace(ROUTES.RATE_REVIEW, { placeId: place.id, fromAddPlace: true });
        }
      };

      if (upload.failed > 0) {
        showAlert(
          isReport ? 'Report submitted' : 'Place added',
          `${upload.failed} photo${upload.failed === 1 ? '' : 's'} failed to upload. You can retry from the place page.`,
          [{ text: 'Continue', onPress: next }],
        );
      } else if (isReport) {
        showAlert(
          'Report submitted',
          appSettings.payoutForNoRestroomReports
            ? `Thanks. An administrator will verify it; if it checks out, your $${appSettings.payoutAmountUSD.toFixed(2)} credit is approved.`
            : 'Thanks. An administrator will verify it.',
          [{ text: 'OK', onPress: next }],
        );
      } else {
        next();
      }
    } catch (err) {
      showAlert(isReport ? 'Could not submit report' : 'Could not add place', err.message);
    } finally {
      setSubmitting(false);
    }
  }, [validation, ackNeeded, acceptContributorTerms, dropPin, name, selected, addressText, placeType, isReport, reason, amenities, customIds, notes, photos, presence, uploadAll, navigation, appSettings]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Address */}
        <AddressAutosuggest
          value={addressText}
          onChangeText={handleAddressTextChange}
          onSelect={handleSelectAddress}
          near={location}
          placeholder="Search or enter address"
        />
        <Pressable onPress={handleUseMyLocation} disabled={locating} style={styles.useLocation} accessibilityRole="button">
          <Ionicons name="navigate-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.useLocationText}>{locating ? 'Finding address…' : 'Use my current location'}</Text>
        </Pressable>
        {selected ? (
          <View style={styles.selectedRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.selectedText} numberOfLines={2}>{addressText}</Text>
          </View>
        ) : null}

        {/* GPS confirmation */}
        {appSettings.requirePresenceToSubmit || appSettings.presenceCheckEnabled ? (
          <PresenceStatusCard
            confirmation={presence.confirmation}
            distanceM={presence.distanceM}
            radiusM={presence.radiusM}
            placeLabel="this address"
            onRetry={presence.retry}
            style={styles.presence}
          />
        ) : null}

        {/* What did you find? */}
        <SectionHeader title="What did you find here?" />
        <View style={styles.typeRow}>
          {AVAILABILITY.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => setAvailability(a.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: availability === a.key }}
              style={[styles.availability, availability === a.key && styles.availabilityActive]}
            >
              <Ionicons name={a.icon} size={18} color={availability === a.key ? colors.textOnDark : colors.textPrimary} />
              <Text style={[styles.availabilityText, availability === a.key && styles.availabilityTextActive]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        {isReport ? (
          <View style={[styles.typeRow, { marginTop: spacing.sm }]}>
            <Chip label="Has a restroom, not open to the public" active={reason === 'not_public'} onPress={() => setReason('not_public')} />
            <Chip label="No restroom on site at all" active={reason === 'none_on_site'} onPress={() => setReason('none_on_site')} />
          </View>
        ) : null}
        {isReport ? (
          <Text style={styles.hint}>
            Reports that there is no public restroom at an address help others skip the trip. An administrator verifies each report
            {appSettings.payoutForNoRestroomReports ? `; verified reports earn the same $${appSettings.payoutAmountUSD.toFixed(2)} credit as a place with a review.` : '.'}
          </Text>
        ) : null}

        {/* Name */}
        <SectionHeader title={isReport ? 'Business or building name' : 'Place name'} />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Riverside Market"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          returnKeyType="done"
          accessibilityLabel="Place name"
        />

        {/* Restroom spot (evidence) */}
        {!isReport && appSettings.presenceCheckEnabled && presence.permission === 'granted' ? (
          <>
            <SectionHeader title="Mark the restroom spot (optional)" />
            <Pressable onPress={handleMarkSpot} disabled={markingSpot} style={styles.markSpot} accessibilityRole="button">
              <Ionicons name={presence.restroomFix ? 'locate' : 'locate-outline'} size={18} color={colors.primary} />
              <View style={styles.markSpotText}>
                <Text style={styles.markSpotTitle}>{presence.restroomFix ? 'Restroom spot marked' : markingSpot ? 'Reading position…' : 'Stand at the restroom door and tap'}</Text>
                <Text style={styles.markSpotCaption}>
                  {presence.restroomFix
                    ? `Recorded${presence.restroomFix.accuracy !== null ? ` (GPS ±${Math.round(presence.restroomFix.accuracy)} m)` : ''}. Tap again to update.`
                    : 'Helps verification: the review shows time spent at the restroom versus elsewhere on the premises.'}
                </Text>
              </View>
            </Pressable>
          </>
        ) : null}

        {/* Photos */}
        <SectionHeader title={isReport ? 'Photo of the sign or door (optional)' : 'Add Photos (optional)'} caption={`${photos.length} / ${maxPhotos}`} />
        <PhotoPicker photos={photos} onChange={setPhotos} max={maxPhotos} />
        {!isUploadConfigured() && photos.length > 0 ? (
          <Text style={styles.hint}>Photos will be kept on this device until an upload server is configured.</Text>
        ) : null}
        <Text style={styles.hint}>Never photograph people, and never photograph inside a restroom while anyone is present.</Text>

        {/* Place type */}
        <SectionHeader title="Place Type" />
        <View style={styles.typeRow}>
          {PLACE_TYPES.map((t) => (
            <Chip key={t} label={t} active={placeType === t} onPress={() => setPlaceType(t)} />
          ))}
        </View>

        {/* Amenities (restroom only) */}
        {!isReport ? (
          <>
            <SectionHeader title="Amenities" />
            <AmenityPicker
              value={amenities}
              onChange={setAmenities}
              onSuggest={(group) => setSuggestGroup(group)}
            />
            {customIds.length > 0 ? (
              <Text style={styles.hint}>
                {customIds.length} suggested amenit{customIds.length === 1 ? 'y' : 'ies'} pending review will be attached to this place.
              </Text>
            ) : null}
          </>
        ) : null}

        {/* Notes */}
        <SectionHeader title={isReport ? 'How do you know? (optional)' : 'Notes (optional)'} caption={`${notes.length} / ${NOTES_MAX}`} />
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={isReport ? 'e.g. Sign on the door says employees only' : 'Anything else we should know?'}
          placeholderTextColor={colors.placeholder}
          multiline
          maxLength={NOTES_MAX}
          style={[styles.input, styles.notes]}
          textAlignVertical="top"
          accessibilityLabel="Notes"
        />

        {/* Contributor acknowledgment — first submission only */}
        {ackNeeded ? (
          <View style={styles.ack}>
            <Text style={styles.ackTitle}>Contributor acknowledgment</Text>
            {ackPoints.map((p, i) => (
              <View key={i} style={styles.ackRow}>
                <Ionicons name="ellipse" size={5} color={colors.textSecondary} style={styles.ackBullet} />
                <Text style={styles.ackText}>{p}</Text>
              </View>
            ))}
            <Pressable onPress={() => navigation.navigate(ROUTES.LEGAL, { readOnly: true, doc: LEGAL_DOCS.CONTRIBUTOR })} accessibilityRole="link" style={styles.ackLink}>
              <Text style={styles.ackLinkText}>Read the full Contributor Terms</Text>
            </Pressable>
            <Pressable onPress={() => setAckChecked((v) => !v)} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: ackChecked }}>
              <Ionicons name={ackChecked ? 'checkbox' : 'square-outline'} size={22} color={ackChecked ? colors.primary : colors.textSecondary} />
              <Text style={styles.checkText}>I understand and agree.</Text>
            </Pressable>
          </View>
        ) : null}

        {validation ? <Text style={styles.validation}>{validation}</Text> : null}

        <PrimaryButton
          label={isReport ? 'Submit Report' : 'Submit Place'}
          onPress={handleSubmit}
          disabled={!!validation}
          loading={submitting}
          style={styles.submit}
        />
      </ScrollView>

      <SuggestAmenitySheet
        visible={suggestGroup !== null}
        initialGroup={suggestGroup}
        onClose={() => setSuggestGroup(null)}
        onSubmitted={(submission) => setCustomIds((ids) => [...ids, submission.id])}
      />
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
  useLocation: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
    alignSelf:     'flex-start',
    marginTop:     spacing.sm,
    paddingVertical: spacing.xs,
  },
  useLocationText: {
    ...typography.caption,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
    marginTop:     spacing.xs,
  },
  selectedText: {
    ...typography.caption,
    flex:  1,
    color: colors.textPrimary,
  },
  presence: {
    marginTop: spacing.md,
  },
  input: {
    height:            48,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
    paddingHorizontal: spacing.md,
    fontFamily:        fonts.regular,
    fontSize:          fontSizes.md,
    color:             colors.textPrimary,
  },
  notes: {
    height:          110,
    paddingVertical: spacing.md,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
  availability: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.xs,
    height:          46,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    backgroundColor: colors.surface,
  },
  availabilityActive: {
    backgroundColor: colors.primary,
    borderColor:     colors.primary,
  },
  availabilityText: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  availabilityTextActive: {
    color: colors.textOnDark,
  },
  markSpot: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.md,
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
  },
  markSpotText:    { flex: 1 },
  markSpotTitle:   { ...typography.bodyMedium },
  markSpotCaption: { ...typography.caption, marginTop: 2 },
  hint: {
    ...typography.label,
    marginTop: spacing.sm,
  },
  ack: {
    marginTop:       spacing.xl,
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.lg,
    gap:             spacing.sm,
  },
  ackTitle:    { ...typography.bodyMedium },
  ackRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  ackBullet:   { marginTop: 7 },
  ackText:     { ...typography.caption, color: colors.textPrimary, flex: 1 },
  ackLink:     { paddingVertical: spacing.xs },
  ackLinkText: { ...typography.captionMedium, color: colors.primary },
  checkRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs },
  checkText:   { ...typography.bodyMedium },
  validation: {
    ...typography.caption,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  submit: {
    marginTop: spacing.lg,
  },
});

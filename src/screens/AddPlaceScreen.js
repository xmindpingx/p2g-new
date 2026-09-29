// places2go — AddPlaceScreen (wireframe #8)
// Search or enter address → Add Photos → Place Type → Amenities → Notes → Submit.
//
// Flow on submit:
//   1. dropPin() stores the place with photos marked 'local' (instant, offline-safe).
//   2. Each photo is uploaded; on success updatePhotoUploadStatus() marks it
//      'uploaded' and enqueues it for AI moderation. On failure it is marked
//      'failed' and can be retried from Place Details later.
//   3. Navigate to Rate & Review for the new place so the contributor can
//      complete the qualifying review that earns the $2 credit.

import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable, Alert, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, fonts, fontSizes } from '../theme';
import useStore, { PLACE_TYPES } from '../store/useStore';
import useUserLocation from '../hooks/useUserLocation';
import { ROUTES } from '../navigation/routes';
import { reverseGeocode } from '../services/nominatim';
import { uploadPhoto, isUploadConfigured } from '../services/uploads';
import AddressAutosuggest from '../components/AddressAutosuggest';
import PhotoPicker from '../components/PhotoPicker';
import AmenityPicker from '../components/AmenityPicker';
import SuggestAmenitySheet from '../components/SuggestAmenitySheet';
import SectionHeader from '../components/SectionHeader';
import PrimaryButton from '../components/PrimaryButton';
import { Chip } from '../components/FilterChips';

const NOTES_MAX = 300;

export default function AddPlaceScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const appSettings             = useStore((s) => s.appSettings);
  const currentUser             = useStore((s) => s.currentUser);
  const dropPin                 = useStore((s) => s.dropPin);
  const updatePhotoUploadStatus = useStore((s) => s.updatePhotoUploadStatus);
  const markPhotoUploadFailed   = useStore((s) => s.markPhotoUploadFailed);

  const { location } = useUserLocation();

  // ── Form state ────────────────────────────────────────────────────────────
  const [addressText, setAddressText] = useState('');
  const [selected, setSelected]       = useState(null); // normalised Nominatim result
  const [name, setName]               = useState('');
  const [photos, setPhotos]           = useState([]);
  const [placeType, setPlaceType]     = useState(PLACE_TYPES[0]);
  const [amenities, setAmenities]     = useState({});
  const [customIds, setCustomIds]     = useState([]);
  const [notes, setNotes]             = useState('');
  const [suggestGroup, setSuggestGroup] = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [locating, setLocating]       = useState(false);

  const maxPhotos = appSettings.maxPhotosPerPlace;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectAddress = useCallback((result) => {
    setSelected(result);
    setAddressText(result.formattedAddress || result.displayName);
    if (!name.trim() && result.name) setName(result.name);
  }, [name]);

  const handleUseMyLocation = useCallback(async () => {
    if (!location) {
      Alert.alert('Location unavailable', 'Turn on location services to use your current position.');
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
      Alert.alert('Address lookup failed', 'Your position was saved without a street address.');
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

  const validation = useMemo(() => {
    if (!name.trim())            return 'Give the place a name.';
    if (!selected)               return 'Pick an address from the suggestions.';
    if (photos.length > maxPhotos) return `You can add up to ${maxPhotos} photos.`;
    return null;
  }, [name, selected, photos.length, maxPhotos]);

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
    if (validation) { Alert.alert('Almost there', validation); return; }
    setSubmitting(true);
    try {
      const place = dropPin({
        name,
        address:   selected.formattedAddress || addressText,
        latitude:  selected.latitude,
        longitude: selected.longitude,
        placeType,
        amenities,
        customAmenityIds: customIds,
        notes,
        photos: photos.map((p) => ({ localUri: p.localUri })),
      });

      const upload = await uploadAll(place);

      const next = () =>
        navigation.replace(ROUTES.RATE_REVIEW, { placeId: place.id, fromAddPlace: true });

      if (upload.failed > 0) {
        Alert.alert(
          'Place added',
          `${upload.failed} photo${upload.failed === 1 ? '' : 's'} failed to upload. You can retry from the place page.`,
          [{ text: 'Continue', onPress: next }],
        );
      } else {
        next();
      }
    } catch (err) {
      Alert.alert('Could not add place', err.message);
    } finally {
      setSubmitting(false);
    }
  }, [validation, dropPin, name, selected, addressText, placeType, amenities, customIds, notes, photos, uploadAll, navigation]);

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

        {/* Name */}
        <SectionHeader title="Place name" />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Riverside Market"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          returnKeyType="done"
          accessibilityLabel="Place name"
        />

        {/* Photos */}
        <SectionHeader title="Add Photos (optional)" caption={`${photos.length} / ${maxPhotos}`} />
        <PhotoPicker photos={photos} onChange={setPhotos} max={maxPhotos} />
        {!isUploadConfigured() && photos.length > 0 ? (
          <Text style={styles.hint}>Photos will be kept on this device until an upload server is configured.</Text>
        ) : null}

        {/* Place type */}
        <SectionHeader title="Place Type" />
        <View style={styles.typeRow}>
          {PLACE_TYPES.map((t) => (
            <Chip key={t} label={t} active={placeType === t} onPress={() => setPlaceType(t)} />
          ))}
        </View>

        {/* Amenities */}
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

        {/* Notes */}
        <SectionHeader title="Notes (optional)" caption={`${notes.length} / ${NOTES_MAX}`} />
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything else we should know?"
          placeholderTextColor={colors.placeholder}
          multiline
          maxLength={NOTES_MAX}
          style={[styles.input, styles.notes]}
          textAlignVertical="top"
          accessibilityLabel="Notes"
        />

        {validation ? <Text style={styles.validation}>{validation}</Text> : null}

        <PrimaryButton
          label="Submit Place"
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
  hint: {
    ...typography.label,
    marginTop: spacing.sm,
  },
  validation: {
    ...typography.caption,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  submit: {
    marginTop: spacing.lg,
  },
});

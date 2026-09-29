// places2go — PhotoPicker
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Camera tile + thumbnails, capped at `max` (read from appSettings by the
// caller so a mod/admin can change the limit without a release).
//
// Each picked photo is stored as { id, localUri, uploadStatus: 'local' }.
// The actual upload to your server happens after submit (see AddPlaceScreen);
// this component only collects local URIs.

import React, { useCallback } from 'react';
import { View, Text, Image, Pressable, Alert, Linking, ScrollView, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../theme';
import { UPLOAD_STATUS } from '../constants/moderation';

const TILE = 88;

const makeLocalPhoto = (asset) => ({
  id:           `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  localUri:     asset.uri,
  width:        asset.width ?? null,
  height:       asset.height ?? null,
  uploadStatus: UPLOAD_STATUS.LOCAL,
});

async function ensurePermission(kind) {
  const request =
    kind === 'camera'
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;
  const result = await request();
  if (result.granted) return true;

  Alert.alert(
    kind === 'camera' ? 'Camera access needed' : 'Photo library access needed',
    kind === 'camera'
      ? 'Allow camera access to take a photo of this place.'
      : 'Allow photo access to add pictures of this place.',
    result.canAskAgain
      ? [{ text: 'OK' }]
      : [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
  );
  return false;
}

export default function PhotoPicker({ photos = [], onChange, max = 10, style }) {
  const remaining = Math.max(0, max - photos.length);

  const addAssets = useCallback(
    (assets) => {
      if (!assets?.length) return;
      const next = [...photos, ...assets.slice(0, remaining).map(makeLocalPhoto)];
      onChange(next);
    },
    [photos, remaining, onChange],
  );

  const pickFromLibrary = useCallback(async () => {
    if (remaining === 0) return;
    if (!(await ensurePermission('library'))) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (!result.canceled) addAssets(result.assets);
  }, [remaining, addAssets]);

  const takePhoto = useCallback(async () => {
    if (remaining === 0) return;
    if (!(await ensurePermission('camera'))) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) addAssets(result.assets);
  }, [remaining, addAssets]);

  const choose = useCallback(() => {
    if (remaining === 0) {
      Alert.alert('Photo limit reached', `You can add up to ${max} photos.`);
      return;
    }
    Alert.alert('Add a photo', null, [
      { text: 'Take Photo',          onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [remaining, max, takePhoto, pickFromLibrary]);

  const remove = useCallback(
    (id) => onChange(photos.filter((p) => p.id !== id)),
    [photos, onChange],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        onPress={choose}
        accessibilityRole="button"
        accessibilityLabel={`Add photo, ${remaining} remaining`}
        style={({ pressed }) => [styles.tile, styles.addTile, pressed && styles.pressed]}
      >
        <Ionicons name="camera-outline" size={26} color={colors.textPrimary} />
        <Text style={styles.addLabel}>{photos.length === 0 ? 'Add' : `${remaining} left`}</Text>
      </Pressable>

      {photos.map((photo) => (
        <View key={photo.id} style={styles.tile}>
          <Image source={{ uri: photo.localUri }} style={styles.image} resizeMode="cover" />
          <Pressable
            onPress={() => remove(photo.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            style={styles.remove}
          >
            <Ionicons name="close" size={14} color={colors.textOnDark} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap:           spacing.sm,
    paddingRight:  spacing.lg,
  },
  tile: {
    width:           TILE,
    height:          TILE,
    borderRadius:    radius.md,
    overflow:        'hidden',
    backgroundColor: colors.surface,
  },
  addTile: {
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing.xs,
    borderWidth:    1,
    borderStyle:    'dashed',
    borderColor:    colors.chipInactiveBorder,
  },
  addLabel: {
    ...typography.label,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.8,
  },
  image: {
    width:  '100%',
    height: '100%',
  },
  remove: {
    position:        'absolute',
    top:             spacing.xs,
    right:           spacing.xs,
    width:           22,
    height:          22,
    borderRadius:    radius.pill,
    backgroundColor: colors.overlay,
    alignItems:      'center',
    justifyContent:  'center',
  },
});

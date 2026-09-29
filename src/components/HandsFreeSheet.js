// places2go — HandsFreeSheet
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Bottom sheet for voice search: shows what is being heard, what the parser
// understood (as chips, so nothing is applied silently), the top result, and
// the spoken answer. Buttons mirror the voice commands (Directions · Walk ·
// Drive · Repeat) for anyone who would rather tap.

import React from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, shadows } from '../theme';
import { ASSISTANT_PHASE } from '../hooks/useVoiceAssistant';
import { formatDistance } from '../utils/geo';
import { Chip } from './FilterChips';
import PrimaryButton from './PrimaryButton';
import StarRating from './StarRating';

const EXAMPLES = [
  '“Closest restroom with a changing table”',
  '“Nearest free bathroom that’s open”',
  '“Find an accessible place rated four stars or better”',
  '“Closest place I rated”',
];

export default function HandsFreeSheet({ visible, assistant, onClose, onOpenPlace, onDirections }) {
  const insets = useSafeAreaInsets();
  const { phase, transcript, parsed, result, spoken, error, available } = assistant;
  const place = result?.place || null;

  const listening = phase === ASSISTANT_PHASE.LISTENING;
  const busy      = phase === ASSISTANT_PHASE.THINKING || phase === ASSISTANT_PHASE.SPEAKING;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <Text style={styles.title}>Hands-free search</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        {available === false ? (
          <Text style={styles.caption}>Speech recognition is not available on this device.</Text>
        ) : null}

        {/* Mic */}
        <Pressable
          onPress={listening ? assistant.stopListening : assistant.listen}
          disabled={busy || available === false}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Stop listening' : 'Start listening'}
          style={({ pressed }) => [styles.mic, listening && styles.micActive, pressed && styles.pressed, (busy || available === false) && styles.micDisabled]}
        >
          {busy ? <ActivityIndicator color={colors.textOnDark} /> : <Ionicons name={listening ? 'stop' : 'mic'} size={30} color={colors.textOnDark} />}
        </Pressable>
        <Text style={styles.status}>
          {listening ? 'Listening…' : phase === ASSISTANT_PHASE.THINKING ? 'Searching…' : phase === ASSISTANT_PHASE.SPEAKING ? 'Speaking…' : 'Tap the mic and ask'}
        </Text>

        {transcript ? <Text style={styles.transcript}>“{transcript}”</Text> : null}

        {parsed?.understood?.length ? (
          <View style={styles.understood}>
            {parsed.understood.map((u) => <Chip key={u} label={u} active disabled />)}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {place ? (
          <Pressable onPress={() => onOpenPlace?.(place)} accessibilityRole="button" style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
            <View style={styles.resultText}>
              <Text style={styles.resultName} numberOfLines={1}>{place.name}</Text>
              <Text style={styles.resultMeta} numberOfLines={1}>
                {Number.isFinite(place.distanceMi) ? `${formatDistance(place.distanceMi)} · ` : ''}
                {place.isOpen ? 'Open' : 'Closed'}
                {result.total > 1 ? ` · ${result.total - 1} more match${result.total - 1 === 1 ? '' : 'es'}` : ''}
              </Text>
              <View style={styles.resultRating}>
                <StarRating rating={place.rating?.average || 0} size={12} />
                <Text style={styles.resultCount}>{place.rating?.count > 0 ? `(${place.rating.count})` : 'No reviews yet'}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {spoken && !place ? <Text style={styles.spoken}>{spoken}</Text> : null}

        {place ? (
          <View style={styles.actions}>
            <PrimaryButton label="Walk" variant="secondary" onPress={() => onDirections?.(place, 'walking')} style={styles.action} />
            <PrimaryButton label="Drive" variant="secondary" onPress={() => onDirections?.(place, 'driving')} style={styles.action} />
            <PrimaryButton label="Repeat" variant="secondary" onPress={assistant.speakAgain} style={styles.action} />
          </View>
        ) : (
          <View style={styles.examples}>
            {EXAMPLES.map((e) => <Text key={e} style={styles.example}>{e}</Text>)}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, ...shadows.floating },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.border, marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.subheading },
  caption: { ...typography.caption, marginTop: spacing.sm },
  mic: { alignSelf: 'center', width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, ...shadows.card },
  micActive: { backgroundColor: colors.accent },
  micDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  status: { ...typography.captionMedium, textAlign: 'center', marginTop: spacing.sm },
  transcript: { ...typography.body, textAlign: 'center', marginTop: spacing.sm },
  understood: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center', marginTop: spacing.sm },
  error: { ...typography.caption, color: colors.modRejectedText, textAlign: 'center', marginTop: spacing.sm },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  resultText: { flex: 1 },
  resultName: { ...typography.bodyMedium },
  resultMeta: { ...typography.caption, marginTop: 2 },
  resultRating: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  resultCount: { ...typography.label },
  spoken: { ...typography.caption, textAlign: 'center', marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1, height: 44 },
  examples: { marginTop: spacing.md, gap: spacing.xs },
  example: { ...typography.label, textAlign: 'center' },
});

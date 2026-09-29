// places2go — ModQueueScreen
// Manual review of content the AI flagged (or could not process). Each card
// shows the actual content — the photo, the review text, or the place note —
// plus the AI's confidence and reason, and Approve / Reject with an optional
// note. Resolved items can be viewed under the "Resolved" segment.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Image, FlatList, Pressable, TextInput, Modal, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, fonts, fontSizes, shadows } from '../theme';
import useStore from '../store/useStore';
import { AI_STATUS, MANUAL_STATUS, CONTENT_TYPE, FLAG_REASON_LABELS } from '../constants/moderation';
import PrimaryButton from '../components/PrimaryButton';

const SEGMENTS = [
  { key: 'open',     label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
];

const CONTENT_LABEL = {
  [CONTENT_TYPE.PHOTO]:       'Photo',
  [CONTENT_TYPE.REVIEW_TEXT]: 'Review text',
  [CONTENT_TYPE.PLACE_NOTE]:  'Place note',
};

const formatWhen = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function DecisionSheet({ entry, decision, onClose, onConfirm }) {
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState('');
  if (!entry) return null;
  const approving = decision === MANUAL_STATUS.APPROVED;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>{approving ? 'Approve this content?' : 'Reject this content?'}</Text>
          <Text style={styles.sheetCaption}>
            {approving ? 'It becomes publicly visible immediately.' : 'It stays hidden from everyone except the submitter.'}
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Internal note (optional)"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            multiline
          />
          <PrimaryButton label={approving ? 'Approve' : 'Reject'} onPress={() => onConfirm(notes)} style={styles.sheetButton} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ModQueueScreen() {
  const insets = useSafeAreaInsets();
  const queue   = useStore((s) => s.moderationQueue);
  const places  = useStore((s) => s.places);
  const reviews = useStore((s) => s.reviews);
  const setManualModerationStatus = useStore((s) => s.setManualModerationStatus);

  const [segment, setSegment] = useState('open');
  const [pending, setPending] = useState(null); // { entry, decision }

  const items = useMemo(() => {
    const open = (e) =>
      (e.aiStatus === AI_STATUS.FLAGGED || e.aiStatus === AI_STATUS.ERROR) && e.manualStatus === MANUAL_STATUS.AWAITING;
    const list = queue.filter((e) => (segment === 'open' ? open(e) : e.manualStatus !== MANUAL_STATUS.AWAITING));
    return list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [queue, segment]);

  // Resolve the actual content for a queue entry so the reviewer sees it.
  const resolveContent = useCallback((entry) => {
    const place = places.find((p) => p.id === entry.placeId);
    if (entry.contentType === CONTENT_TYPE.PLACE_NOTE) {
      return { text: place?.notes || '', photoUri: null, placeName: place?.name };
    }
    if (entry.contentType === CONTENT_TYPE.REVIEW_TEXT) {
      const review = reviews.find((r) => r.id === entry.contentRef);
      return { text: review?.text || '', photoUri: null, placeName: place?.name };
    }
    // PHOTO — may live on the place or on a review
    const fromPlace = place?.photos?.find((p) => p.id === entry.contentRef);
    const fromReview = !fromPlace
      ? reviews.flatMap((r) => r.photos || []).find((p) => p.id === entry.contentRef)
      : null;
    const photo = fromPlace || fromReview;
    return { text: null, photoUri: photo?.uploadedUrl || photo?.localUri || null, placeName: place?.name };
  }, [places, reviews]);

  const confirm = useCallback((notes) => {
    if (!pending) return;
    setManualModerationStatus(pending.entry.id, pending.decision, notes);
    setPending(null);
  }, [pending, setManualModerationStatus]);

  const renderItem = ({ item }) => {
    const content  = resolveContent(item);
    const resolved = item.manualStatus !== MANUAL_STATUS.AWAITING;
    const aiLabel  = item.aiStatus === AI_STATUS.ERROR
      ? 'AI could not process'
      : `AI flagged${item.aiConfidence !== null ? ` · ${(item.aiConfidence * 100).toFixed(0)}%` : ''}`;
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardType}>{CONTENT_LABEL[item.contentType] || item.contentType}</Text>
          <Text style={styles.cardWhen}>{formatWhen(item.createdAt)}</Text>
        </View>
        {content.placeName ? <Text style={styles.cardPlace}>{content.placeName}</Text> : null}

        {content.photoUri ? (
          <Image source={{ uri: content.photoUri }} style={styles.photo} resizeMode="cover" />
        ) : content.text ? (
          <Text style={styles.contentText}>"{content.text}"</Text>
        ) : (
          <Text style={styles.contentMissing}>Content is no longer available.</Text>
        )}

        <View style={[styles.aiRow, { backgroundColor: item.aiStatus === AI_STATUS.ERROR ? colors.modPendingBg : colors.modFlaggedBg }]}>
          <Ionicons name="hardware-chip-outline" size={14} color={item.aiStatus === AI_STATUS.ERROR ? colors.modPendingText : colors.modFlaggedText} />
          <Text style={[styles.aiText, { color: item.aiStatus === AI_STATUS.ERROR ? colors.modPendingText : colors.modFlaggedText }]}>
            {aiLabel}{item.flagReason ? ` · ${FLAG_REASON_LABELS[item.flagReason] || item.flagReason}` : ''}
          </Text>
        </View>

        {resolved ? (
          <View style={[styles.resolved, { backgroundColor: item.manualStatus === MANUAL_STATUS.APPROVED ? colors.modApprovedBg : colors.modRejectedBg }]}>
            <Text style={[styles.resolvedText, { color: item.manualStatus === MANUAL_STATUS.APPROVED ? colors.modApprovedText : colors.modRejectedText }]}>
              {item.manualStatus === MANUAL_STATUS.APPROVED ? 'Approved' : 'Rejected'} · {formatWhen(item.reviewedAt)}
            </Text>
            {item.notes ? <Text style={styles.resolvedNote}>{item.notes}</Text> : null}
          </View>
        ) : (
          <View style={styles.actions}>
            <PrimaryButton label="Reject"  variant="secondary" onPress={() => setPending({ entry: item, decision: MANUAL_STATUS.REJECTED })} style={styles.action} />
            <PrimaryButton label="Approve" onPress={() => setPending({ entry: item, decision: MANUAL_STATUS.APPROVED })} style={styles.action} />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.segments}>
        {SEGMENTS.map((s) => (
          <Pressable key={s.key} onPress={() => setSegment(s.key)} accessibilityRole="button" style={[styles.segment, segment === s.key && styles.segmentActive]}>
            <Text style={[styles.segmentText, segment === s.key && styles.segmentTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }, items.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="shield-checkmark-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>{segment === 'open' ? 'Queue is clear' : 'Nothing resolved yet'}</Text>
            <Text style={styles.emptyCaption}>
              {segment === 'open' ? 'Content the AI flags will appear here for a decision.' : 'Decisions you make will be listed here.'}
            </Text>
          </View>
        }
      />

      {pending ? (
        <DecisionSheet entry={pending.entry} decision={pending.decision} onClose={() => setPending(null)} onConfirm={confirm} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.adminSurface },
  segments: { flexDirection: 'row', margin: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, borderWidth: 1, borderColor: colors.adminBorder },
  segment: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { ...typography.captionMedium, color: colors.textPrimary },
  segmentTextActive: { color: colors.textOnDark },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  listEmpty: { flexGrow: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.adminBorder, gap: spacing.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardType: { ...typography.adminSectionHeader },
  cardWhen: { ...typography.label },
  cardPlace: { ...typography.bodyMedium },
  photo: { width: '100%', height: 220, borderRadius: radius.sm, backgroundColor: colors.background },
  contentText: { ...typography.body },
  contentMissing: { ...typography.caption, fontStyle: 'italic' },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2, alignSelf: 'flex-start' },
  aiText: { ...typography.badge },
  resolved: { borderRadius: radius.sm, padding: spacing.sm },
  resolvedText: { ...typography.captionMedium },
  resolvedNote: { ...typography.caption, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1, height: 44 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.subheading },
  emptyCaption: { ...typography.caption, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, ...shadows.floating },
  sheetTitle: { ...typography.subheading },
  sheetCaption: { ...typography.caption, marginTop: spacing.xs, marginBottom: spacing.md },
  input: { minHeight: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: spacing.md, fontFamily: fonts.regular, fontSize: fontSizes.md, color: colors.textPrimary, textAlignVertical: 'top' },
  sheetButton: { marginTop: spacing.md },
});

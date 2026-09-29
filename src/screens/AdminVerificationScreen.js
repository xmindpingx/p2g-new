// places2go — AdminVerificationScreen (admin only)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Two segments:
//   Reports — "No public restroom" reports awaiting verification, each with
//             the contributor's note, photos, and the presence evidence card
//             (distance, dwell, zone timeline, GPS accuracy, mock flag).
//             Verify approves the pending credit; Reject declines it.
//   Payouts — every credit in the ledger. Pending → Approve / Decline;
//             Approved → Pay now (Stripe Connect through your payments server,
//             or Cash App / Zelle with the contributor's details and a
//             reference), each with the submission's evidence attached.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Image, FlatList, Pressable, TextInput, Modal, Linking, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { showAlert } from '../utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { colors, typography, spacing, radius, fonts, fontSizes, shadows } from '../theme';
import useStore, { PAYOUT_STATUS, PAYOUT_KIND, PAYOUT_KIND_LABELS, PAYOUT_METHODS, PAYOUT_METHOD_LABELS, REPORT_VERIFICATION, payoutMethodContact } from '../store/useStore';
import { ROUTES } from '../navigation/routes';
import { sendPayout, isPaymentsApiConfigured, cashAppUrl } from '../services/payments';
import { RISK_FLAG_LABELS } from '../services/presence';
import PrimaryButton from '../components/PrimaryButton';
import PresenceEvidenceCard from '../components/PresenceEvidenceCard';
import BusinessContactCard from '../components/BusinessContactCard';

const SEGMENTS = [
  { key: 'reports', label: 'Reports' },
  { key: 'payouts', label: 'Payouts' },
];

const PAYOUT_FILTERS = [
  { key: PAYOUT_STATUS.PENDING,  label: 'Pending' },
  { key: PAYOUT_STATUS.APPROVED, label: 'Approved' },
  { key: PAYOUT_STATUS.PAID,     label: 'Paid' },
  { key: PAYOUT_STATUS.REJECTED, label: 'Declined' },
];

const fmt = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// ---------------------------------------------------------------------------
// Note sheet — used for verify / reject / decline / mark-paid reference
// ---------------------------------------------------------------------------
function NoteSheet({ visible, title, caption, placeholder, confirmLabel, onClose, onConfirm, destructive = false }) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState('');
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {caption ? <Text style={styles.sheetCaption}>{caption}</Text> : null}
          <TextInput value={note} onChangeText={setNote} placeholder={placeholder} placeholderTextColor={colors.placeholder} style={styles.input} multiline />
          <PrimaryButton label={confirmLabel} onPress={() => { onConfirm(note); setNote(''); }} style={styles.sheetButton} variant={destructive ? 'secondary' : 'primary'} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function AdminVerificationScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const places      = useStore((s) => s.places);
  const ledger      = useStore((s) => s.payoutLedger);
  const reviews     = useStore((s) => s.reviews);
  const appSettings = useStore((s) => s.appSettings);
  const currentUser = useStore((s) => s.currentUser);
  const verifyNoRestroomReport = useStore((s) => s.verifyNoRestroomReport);
  const rejectNoRestroomReport = useStore((s) => s.rejectNoRestroomReport);
  const updatePayoutStatus     = useStore((s) => s.updatePayoutStatus);
  const markPayoutPaid         = useStore((s) => s.markPayoutPaid);

  const [segment, setSegment]       = useState(route.params?.tab === 'payouts' ? 'payouts' : 'reports');
  const [payoutFilter, setFilter]   = useState(PAYOUT_STATUS.PENDING);
  const [sheet, setSheet]           = useState(null); // { kind, id }
  const [paying, setPaying]         = useState(null); // payoutId in flight
  const [showEvidence, setShowEvidence] = useState({});

  const pendingReports = useMemo(
    () => places.filter((p) => p.hasPublicRestroom === false && p.reportVerification === REPORT_VERIFICATION.AWAITING)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [places],
  );
  const payouts = useMemo(
    () => ledger.filter((e) => e.status === payoutFilter).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [ledger, payoutFilter],
  );
  const placeById = useCallback((id) => places.find((p) => p.id === id) || null, [places]);

  // Contributor payout method is only known locally for this device's user;
  // in production your server returns it with the ledger.
  const methodFor = useCallback((userId) => (userId === currentUser.id ? currentUser.payoutMethod : null), [currentUser]);
  const stripeFor = useCallback((userId) => (userId === currentUser.id ? currentUser.stripeConnect : null), [currentUser]);

  const run = useCallback((fn, successTitle) => {
    try {
      const result = fn();
      if (successTitle) showAlert(successTitle, typeof result === 'string' ? result : undefined);
    } catch (err) {
      showAlert('Not saved', err.message);
    }
  }, []);

  const confirmSheet = useCallback((note) => {
    if (!sheet) return;
    const { kind, id } = sheet;
    setSheet(null);
    if (kind === 'verify')  run(() => { const r = verifyNoRestroomReport(id, note); return r.payoutApproved ? `Report verified. $${r.amount.toFixed(2)} credit approved.` : 'Report verified.'; }, 'Done');
    if (kind === 'reject')  run(() => rejectNoRestroomReport(id, note));
    if (kind === 'approve') run(() => updatePayoutStatus(id, PAYOUT_STATUS.APPROVED, note));
    if (kind === 'decline') run(() => updatePayoutStatus(id, PAYOUT_STATUS.REJECTED, note));
    if (kind === 'paid_cash_app') run(() => markPayoutPaid(id, { paidVia: 'cash_app', transferId: note.trim() || null }));
    if (kind === 'paid_contact')  run(() => markPayoutPaid(id, { paidVia: sheet.paidVia, transferId: note.trim() || null }));
    if (kind === 'paid_manual')   run(() => markPayoutPaid(id, { paidVia: 'manual', transferId: note.trim() || null, note }));
  }, [sheet, run, verifyNoRestroomReport, rejectNoRestroomReport, updatePayoutStatus, markPayoutPaid]);

  const payWithStripe = useCallback(async (entry) => {
    if (!isPaymentsApiConfigured(appSettings)) {
      showAlert('Payments server not configured', 'Set the payments server URL in Admin Settings → Stripe, or mark the credit paid manually.');
      return;
    }
    setPaying(entry.id);
    try {
      const { transferId } = await sendPayout(appSettings, {
        payoutId:  entry.id,
        userId:    entry.userId,
        amountUsd: entry.amount,
        currency:  entry.currency || 'usd',
        placeName: placeById(entry.placeId)?.name || '',
      });
      markPayoutPaid(entry.id, { paidVia: 'stripe_connect', transferId });
      showAlert('Paid', `Transfer ${transferId} sent through Stripe.`);
    } catch (err) {
      showAlert('Payout failed', err.message);
    } finally {
      setPaying(null);
    }
  }, [appSettings, placeById, markPayoutPaid]);

  const copy = useCallback(async (value) => {
    try { await Clipboard.setStringAsync(value); showAlert('Copied', value); } catch (err) { showAlert(value); }
  }, []);

  // ── Renderers ─────────────────────────────────────────────────────────────
  const renderReport = ({ item: place }) => {
    const credit = ledger.find((e) => e.placeId === place.id && e.kind === PAYOUT_KIND.NO_RESTROOM_REPORT) || null;
    const open = !!showEvidence[place.id];
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{place.name}</Text>
            <Text style={styles.cardMeta}>{place.address || 'No address'} · reported {fmt(place.createdAt)}</Text>
            <Text style={styles.cardMeta}>Contributor {String(place.contributorId).slice(-6)} · {credit ? `credit $${credit.amount.toFixed(2)} ${credit.status}` : 'no credit attached'}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate(ROUTES.PLACE_DETAILS, { placeId: place.id })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open place">
            <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
        {place.notes ? <Text style={styles.quote}>"{place.notes}"</Text> : <Text style={styles.cardMeta}>No note from the contributor.</Text>}
        {place.photos?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
            {place.photos.map((p) => (
              <Image key={p.id} source={{ uri: p.uploadedUrl || p.localUri }} style={styles.photo} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : null}
        {place.riskFlags?.length ? (
          <Text style={styles.flags}>{place.riskFlags.map((f) => RISK_FLAG_LABELS[f] || f).join(' · ')}</Text>
        ) : null}
        <Pressable onPress={() => setShowEvidence((e) => ({ ...e, [place.id]: !open }))} style={styles.toggle} accessibilityRole="button">
          <Text style={styles.toggleText}>{open ? 'Hide' : 'Show'} presence evidence</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
        </Pressable>
        {open ? <PresenceEvidenceCard evidence={place.visitEvidence} riskFlags={place.riskFlags} presenceDistanceAtSubmitM={place.presenceDistanceAtSubmitM} /> : null}
        <BusinessContactCard place={place} kind="no_restroom" />
        <View style={styles.actions}>
          <PrimaryButton label="Reject" variant="secondary" onPress={() => setSheet({ kind: 'reject', id: place.id })} style={styles.action} />
          <PrimaryButton label="Verify" onPress={() => setSheet({ kind: 'verify', id: place.id })} style={styles.action} />
        </View>
      </View>
    );
  };

  const renderPayout = ({ item: entry }) => {
    const place  = placeById(entry.placeId);
    const method = methodFor(entry.userId);
    const stripe = stripeFor(entry.userId);
    const review = entry.reviewId ? reviews.find((r) => r.id === entry.reviewId) : null;
    const open   = !!showEvidence[entry.id];
    const isMine = entry.userId === currentUser.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{place?.name || 'Place removed'}</Text>
            <Text style={styles.cardMeta}>{PAYOUT_KIND_LABELS[entry.kind] || 'Contribution'} · {fmt(entry.createdAt)}</Text>
            <Text style={styles.cardMeta}>Contributor {isMine ? 'You (this device)' : String(entry.userId).slice(-6)}</Text>
          </View>
          <Text style={styles.amount}>${entry.amount.toFixed(2)}</Text>
        </View>

        {review ? (
          <Text style={styles.quote}>{review.rating}★ · "{review.text || 'no text'}"{review.presenceDistanceM !== null && review.presenceDistanceM !== undefined ? ` · reviewed ${review.presenceDistanceM} m from the pin` : ''}</Text>
        ) : null}

        {entry.riskFlags?.length ? <Text style={styles.flags}>{entry.riskFlags.map((f) => RISK_FLAG_LABELS[f] || f).join(' · ')}</Text> : null}

        {/* Trail */}
        <View style={styles.trail}>
          {(entry.history || []).map((h, i) => (
            <Text key={i} style={styles.trailText}>{h.status}{h.note ? ` — ${h.note}` : ''} · {fmt(h.at)}</Text>
          ))}
          {entry.transferId ? <Text style={styles.trailText}>ref {entry.transferId}{entry.paidVia ? ` (${entry.paidVia})` : ''}</Text> : null}
        </View>

        {place ? (
          <>
            <Pressable onPress={() => setShowEvidence((e) => ({ ...e, [entry.id]: !open }))} style={styles.toggle} accessibilityRole="button">
              <Text style={styles.toggleText}>{open ? 'Hide' : 'Show'} presence evidence</Text>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
            </Pressable>
            {open ? <PresenceEvidenceCard evidence={place.visitEvidence} riskFlags={place.riskFlags} presenceDistanceAtSubmitM={place.presenceDistanceAtSubmitM} /> : null}
            {entry.status === PAYOUT_STATUS.PENDING ? (
              <BusinessContactCard place={place} kind={place.hasPublicRestroom === false ? 'no_restroom' : 'restroom'} />
            ) : null}
          </>
        ) : null}

        {/* Actions by status */}
        {entry.status === PAYOUT_STATUS.PENDING ? (
          <View style={styles.actions}>
            <PrimaryButton label="Decline" variant="secondary" onPress={() => setSheet({ kind: 'decline', id: entry.id })} style={styles.action} />
            <PrimaryButton label="Approve" onPress={() => setSheet({ kind: 'approve', id: entry.id })} style={styles.action} />
          </View>
        ) : null}

        {entry.status === PAYOUT_STATUS.APPROVED ? (
          <View style={styles.payBox}>
            <Text style={styles.payTitle}>Pay this credit</Text>
            {!method ? (
              <Text style={styles.cardMeta}>
                {isMine ? 'You have not set a payout method (Profile → Payout method).' : 'Payout method not on file for this contributor.'} You can still mark it paid manually.
              </Text>
            ) : method.type === PAYOUT_METHODS.STRIPE ? (
              <>
                <Text style={styles.cardMeta}>Stripe Connect · {stripe?.payoutsEnabled ? 'account ready' : 'account not ready for payouts'}</Text>
                <PrimaryButton label={paying === entry.id ? 'Sending…' : 'Pay now via Stripe'} onPress={() => payWithStripe(entry)} loading={paying === entry.id} disabled={!!paying} />
              </>
            ) : method.type === PAYOUT_METHODS.CASH_APP ? (
              <>
                <View style={styles.methodRow}>
                  <Text style={styles.methodValue}>{PAYOUT_METHOD_LABELS[method.type]} · {method.cashtag}{method.holderName ? ` · ${method.holderName}` : ''}</Text>
                  <Pressable onPress={() => copy(method.cashtag)} hitSlop={8}><Ionicons name="copy-outline" size={18} color={colors.textPrimary} /></Pressable>
                </View>
                <View style={styles.actions}>
                  <PrimaryButton label="Open Cash App" variant="secondary" onPress={() => Linking.openURL(cashAppUrl(method.cashtag, entry.amount)).catch(() => showAlert('Could not open Cash App'))} style={styles.action} />
                  <PrimaryButton label="Mark paid" onPress={() => setSheet({ kind: 'paid_cash_app', id: entry.id })} style={styles.action} />
                </View>
              </>
            ) : (
              <>
                <View style={styles.methodRow}>
                  <Text style={styles.methodValue}>{PAYOUT_METHOD_LABELS[method.type]} · {payoutMethodContact(method)}{method.holderName ? ` · ${method.holderName}` : ''}</Text>
                  <Pressable onPress={() => copy(payoutMethodContact(method))} hitSlop={8}><Ionicons name="copy-outline" size={18} color={colors.textPrimary} /></Pressable>
                </View>
                <Text style={styles.cardMeta}>
                  {method.type === PAYOUT_METHODS.ZELLE
                    ? `Send $${entry.amount.toFixed(2)} from your bank's Zelle, then mark it paid with the confirmation number.`
                    : method.type === PAYOUT_METHODS.APPLE_CASH
                      ? `Send $${entry.amount.toFixed(2)} with Apple Pay (Messages or Wallet on your iPhone) to this contact, then mark it paid.`
                      : `Send $${entry.amount.toFixed(2)} from the Google Pay app to this contact, then mark it paid.`}
                </Text>
                <PrimaryButton label="Mark paid" onPress={() => setSheet({ kind: 'paid_contact', id: entry.id, paidVia: method.type })} />
              </>
            )}
            {(!method || method.type === PAYOUT_METHODS.STRIPE) ? (
              <Pressable onPress={() => setSheet({ kind: 'paid_manual', id: entry.id })} style={styles.toggle} accessibilityRole="button">
                <Text style={styles.toggleText}>Mark paid manually (paid outside the app)</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setSheet({ kind: 'decline', id: entry.id })} style={styles.toggle} accessibilityRole="button">
              <Text style={[styles.toggleText, { color: colors.modRejectedText }]}>Reverse approval (decline)</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const data = segment === 'reports' ? pendingReports : payouts;

  return (
    <View style={styles.container}>
      <View style={styles.segments}>
        {SEGMENTS.map((s) => (
          <Pressable key={s.key} onPress={() => setSegment(s.key)} accessibilityRole="button" style={[styles.segment, segment === s.key && styles.segmentActive]}>
            <Text style={[styles.segmentText, segment === s.key && styles.segmentTextActive]}>
              {s.label}{s.key === 'reports' && pendingReports.length ? ` (${pendingReports.length})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      {segment === 'payouts' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filtersWrap}>
          {PAYOUT_FILTERS.map((f) => {
            const n = ledger.filter((e) => e.status === f.key).length;
            return (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} accessibilityRole="button" style={[styles.filter, payoutFilter === f.key && styles.filterActive]}>
                <Text style={[styles.filterText, payoutFilter === f.key && styles.filterTextActive]}>{f.label} · {n}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <FlatList
        data={data}
        keyExtractor={(i) => i.id}
        renderItem={segment === 'reports' ? renderReport : renderPayout}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }, data.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={segment === 'reports' ? 'shield-checkmark-outline' : 'wallet-outline'} size={32} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>{segment === 'reports' ? 'No reports waiting' : `No ${PAYOUT_FILTERS.find((f) => f.key === payoutFilter)?.label.toLowerCase()} credits`}</Text>
          </View>
        }
      />

      <NoteSheet
        visible={!!sheet}
        title={
          sheet?.kind === 'verify' ? 'Verify this report?' :
          sheet?.kind === 'reject' ? 'Reject this report?' :
          sheet?.kind === 'approve' ? 'Approve this credit?' :
          sheet?.kind === 'decline' ? 'Decline this credit?' :
          'Mark as paid'
        }
        caption={
          sheet?.kind === 'verify' ? 'The place is marked verified and its pending credit is approved.' :
          sheet?.kind === 'reject' ? 'The report is hidden from the map and its credit is declined. The contributor is told why.' :
          sheet?.kind === 'approve' ? 'The credit becomes payable.' :
          sheet?.kind === 'decline' ? 'The contributor is told the credit was not approved.' :
          'Enter the transfer or confirmation reference so the trail is complete.'
        }
        placeholder={sheet?.kind?.startsWith('paid') ? 'Reference / confirmation number (optional)' : 'Note to the contributor (optional)'}
        confirmLabel={
          sheet?.kind === 'verify' ? 'Verify' : sheet?.kind === 'reject' ? 'Reject' :
          sheet?.kind === 'approve' ? 'Approve' : sheet?.kind === 'decline' ? 'Decline' : 'Mark paid'
        }
        destructive={sheet?.kind === 'reject' || sheet?.kind === 'decline'}
        onClose={() => setSheet(null)}
        onConfirm={confirmSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.adminSurface },
  segments: { flexDirection: 'row', margin: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, borderWidth: 1, borderColor: colors.adminBorder },
  segment: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { ...typography.captionMedium, color: colors.textPrimary },
  segmentTextActive: { color: colors.textOnDark },
  filtersWrap: { flexGrow: 0 },
  filters: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  filter: { height: 32, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.chipInactiveBg, borderWidth: 1, borderColor: colors.chipInactiveBorder, alignItems: 'center', justifyContent: 'center' },
  filterActive: { backgroundColor: colors.chipActiveBg, borderColor: colors.chipActiveBg },
  filterText: { ...typography.label, color: colors.chipInactiveText },
  filterTextActive: { color: colors.chipActiveText },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.xs },
  listEmpty: { flexGrow: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.adminBorder, gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardText: { flex: 1 },
  cardTitle: { ...typography.bodyMedium },
  cardMeta: { ...typography.label, marginTop: 2 },
  amount: { ...typography.subheading },
  quote: { ...typography.caption, color: colors.textPrimary, fontStyle: 'italic' },
  photos: { gap: spacing.sm },
  photo: { width: 96, height: 96, borderRadius: radius.sm, backgroundColor: colors.background },
  flags: { ...typography.caption, color: colors.modFlaggedText },
  trail: { gap: 2 },
  trailText: { ...typography.label },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  toggleText: { ...typography.captionMedium, color: colors.primary },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1, height: 44 },
  payBox: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: spacing.md, gap: spacing.sm },
  payTitle: { ...typography.adminSectionHeader },
  methodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  methodValue: { ...typography.captionMedium, color: colors.textPrimary, flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.subheading },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, ...shadows.floating },
  sheetTitle: { ...typography.subheading },
  sheetCaption: { ...typography.caption, marginTop: spacing.xs, marginBottom: spacing.md },
  input: { minHeight: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: spacing.md, fontFamily: fonts.regular, fontSize: fontSizes.md, color: colors.textPrimary, textAlignVertical: 'top' },
  sheetButton: { marginTop: spacing.md },
});

// places2go — PartnerFinderScreen (admin only)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Finds real businesses near a location (OpenStreetMap), scores their fit with
// transparent rules, optionally has Ollama rank them, and writes first-contact
// suggestions customised to what each business sells. Businesses that enroll
// their own restroom receive the enrollment incentive set in Admin Settings.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ScrollView, TextInput, Pressable, Share, Linking, Modal, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { colors, typography, spacing, radius, shadows } from '../theme';
import useStore from '../store/useStore';
import useUserLocation from '../hooks/useUserLocation';
import { showAlert } from '../utils/alert';
import { searchAddress } from '../services/nominatim';
import { findBusinesses, scoreProspect } from '../services/overpass';
import { buildFirstContact, rankProspects, CHANNELS, CHANNEL_LABELS } from '../services/partnerOutreach';
import { isOllamaReady } from '../services/ollama';
import { buildMailtoUrl, buildTelUrl, normalizeWebsite } from '../utils/cobranding';
import {
  PROSPECT_STATUS, PROSPECT_STATUS_LABELS, PROSPECT_CATEGORIES, PROSPECT_CATEGORY_ORDER, SEARCH_RADIUS_OPTIONS_MILES, incentiveText,
} from '../constants/partners';
import PrimaryButton from '../components/PrimaryButton';
import { Chip } from '../components/FilterChips';

const STATUS_STYLE = {
  [PROSPECT_STATUS.NEW]:       { bg: colors.modPendingBg,  text: colors.modPendingText },
  [PROSPECT_STATUS.DRAFTED]:   { bg: colors.modFlaggedBg,  text: colors.modFlaggedText },
  [PROSPECT_STATUS.CONTACTED]: { bg: colors.modFlaggedBg,  text: colors.modFlaggedText },
  [PROSPECT_STATUS.ENROLLED]:  { bg: colors.modCleanBg,    text: colors.modCleanText },
  [PROSPECT_STATUS.DECLINED]:  { bg: colors.modRejectedBg, text: colors.modRejectedText },
  [PROSPECT_STATUS.DISMISSED]: { bg: colors.modPendingBg,  text: colors.modPendingText },
};

const miles = (m) => `${(m / 1609.344).toFixed(m < 160 ? 2 : 1)} mi`;

// ---------------------------------------------------------------------------
// Prospect sheet — facts, fit, drafts, actions
// ---------------------------------------------------------------------------
function ProspectSheet({ prospect, onClose }) {
  const insets       = useSafeAreaInsets();
  const appSettings  = useStore((s) => s.appSettings);
  const update       = useStore((s) => s.updatePartnerProspect);
  const logContact   = useStore((s) => s.logProspectContact);
  const enroll       = useStore((s) => s.enrollProspect);

  const [sells, setSells]     = useState(prospect?.sells || '');
  const [contact, setContact] = useState(prospect?.contactName || '');
  const [channel, setChannel] = useState('email');
  const [busy, setBusy]       = useState(false);
  const [note, setNote]       = useState(null);
  const [subject, setSubject] = useState(prospect?.drafts?.email?.subject || '');
  const [text, setText]       = useState('');

  const drafts = prospect?.drafts || null;
  const status = prospect?.status;
  const blocked = status === PROSPECT_STATUS.DECLINED;
  const offer = incentiveText(appSettings);

  // Load the editable text for the selected channel
  useEffect(() => {
    if (!drafts) { setText(''); return; }
    if (channel === 'email') { setSubject(drafts.email?.subject || ''); setText(drafts.email?.body || ''); }
    else if (channel === 'text') setText(drafts.text?.message || '');
    else setText(drafts[channel]?.script || '');
  }, [drafts, channel]);

  if (!prospect) return null;

  const generate = async () => {
    setBusy(true); setNote(null);
    try {
      update(prospect.id, { sells, contactName: contact });
      const { drafts: d, source, note: n } = await buildFirstContact(prospect, appSettings, { sells, contactName: contact });
      update(prospect.id, { drafts: d, draftSource: source, status: status === PROSPECT_STATUS.NEW ? PROSPECT_STATUS.DRAFTED : status });
      setNote(n || (source === 'ai' ? 'Written by your Ollama model from the facts above. Review before sending.' : null));
    } catch (err) {
      showAlert('Could not generate', err.message);
    } finally { setBusy(false); }
  };

  const copy = async () => {
    try { await Clipboard.setStringAsync(channel === 'email' ? `${subject}\n\n${text}` : text); showAlert('Copied', 'The message is on your clipboard.'); }
    catch (err) { showAlert('Could not copy', err.message); }
  };
  const openUrl = async (url, fail) => { try { await Linking.openURL(url); return true; } catch (err) { showAlert(fail); return false; } };
  const sendEmail = async () => { if (await openUrl(buildMailtoUrl({ to: prospect.email || '', subject, body: text }), 'Could not open a mail app. Use Copy instead.')) logContact(prospect.id, { channel: 'email', note: subject }); };
  const share = async () => {
    try { const r = await Share.share({ title: subject || prospect.name, message: channel === 'email' ? `${subject}\n\n${text}` : text }); if (r.action !== Share.dismissedAction) logContact(prospect.id, { channel, note: 'shared' }); }
    catch (err) { showAlert('Could not share', err.message); }
  };
  const markContacted = () => { logContact(prospect.id, { channel, note: '' }); showAlert('Logged', `Marked ${prospect.name} as contacted via ${CHANNEL_LABELS[channel]}.`); };
  const markEnrolled = () => showAlert('Enrolled?', `${prospect.name} enrolled its own restroom.${offer ? ` This records the incentive: ${offer}.` : ''}`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Yes, enrolled', onPress: () => enroll(prospect.id) },
  ]);
  const markDeclined = () => showAlert('Mark declined?', 'They will be hidden from suggestions and no drafts can be generated for them.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Declined', style: 'destructive', onPress: () => update(prospect.id, { status: PROSPECT_STATUS.DECLINED }) },
  ]);

  const fact = (icon, label) => (label ? <View style={styles.factRow}><Ionicons name={icon} size={15} color={colors.textSecondary} /><Text style={styles.factText}>{label}</Text></View> : null);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg, maxHeight: '92%' }]}>
          <View style={styles.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{prospect.name}</Text>
              <Text style={styles.sheetCaption} numberOfLines={1}>{prospect.categoryLabel}{prospect.brand ? ` · ${prospect.brand}` : ''}{prospect.address ? ` · ${prospect.address}` : ''}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close"><Ionicons name="close" size={22} color={colors.textPrimary} /></Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>WHAT OPENSTREETMAP HAS</Text>
            {fact('water-outline', prospect.toilets ? `Toilets: ${prospect.toilets}` : 'Toilets: not listed')}
            {fact('accessibility-outline', prospect.wheelchair ? `Wheelchair access: ${prospect.wheelchair}` : null)}
            {fact('time-outline', prospect.openingHours)}
            {fact('call-outline', prospect.phone)}
            {fact('mail-outline', prospect.email)}
            {fact('globe-outline', prospect.website)}
            {fact('restaurant-outline', prospect.cuisines?.length ? prospect.cuisines.join(', ') : null)}

            <Text style={styles.sectionLabel}>WHY THIS FIT SCORE ({prospect.fit?.points ?? 0})</Text>
            {(prospect.fit?.reasons || []).map((r) => <Text key={r} style={styles.reason}>{r}</Text>)}
            {prospect.ai ? <Text style={styles.reason}>AI priority {prospect.ai.priority}/5 — {prospect.ai.reason}</Text> : null}

            {offer ? (
              <View style={styles.offer}>
                <Ionicons name="pricetag-outline" size={16} color={colors.textPrimary} />
                <Text style={styles.offerText}>Enrollment offer in drafts: <Text style={styles.offerStrong}>{offer}</Text> when they enroll their own restroom.</Text>
              </View>
            ) : null}

            {blocked ? (
              <View style={[styles.offer, { backgroundColor: colors.modRejectedBg }]}>
                <Text style={[styles.offerText, { color: colors.modRejectedText }]}>This business declined. Do not contact them again.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionLabel}>WHAT THEY SELL (optional — makes the pitch specific)</Text>
                <TextInput value={sells} onChangeText={setSells} style={styles.input} placeholder="e.g. specialty coffee, fresh pastries, sandwiches" placeholderTextColor={colors.placeholder} maxLength={200} />
                <Text style={styles.hint}>Only what you type here and the OpenStreetMap tags above are used. The drafts never invent products or prices.</Text>
                <Text style={[styles.sectionLabel, { marginTop: spacing.sm }]}>CONTACT NAME (optional)</Text>
                <TextInput value={contact} onChangeText={setContact} style={styles.input} placeholder="Owner or manager" placeholderTextColor={colors.placeholder} maxLength={80} />

                <PrimaryButton label={busy ? 'Writing…' : drafts ? 'Regenerate suggestions' : 'Generate first-contact suggestions'} onPress={generate} loading={busy} style={{ marginTop: spacing.md }} variant={drafts ? 'secondary' : 'primary'} />
                {note ? <Text style={styles.hint}>{note}</Text> : null}

                {drafts ? (
                  <>
                    <View style={styles.tabs}>
                      {CHANNELS.map((c) => (
                        <Chip key={c} label={CHANNEL_LABELS[c]} active={channel === c} onPress={() => setChannel(c)} />
                      ))}
                    </View>
                    {channel === 'email' ? (
                      <>
                        <Text style={styles.sectionLabel}>SUBJECT</Text>
                        <TextInput value={subject} onChangeText={setSubject} style={styles.input} />
                      </>
                    ) : null}
                    <Text style={styles.sectionLabel}>{channel === 'in_person' || channel === 'phone' ? 'SCRIPT' : 'MESSAGE'} (edit before using)</Text>
                    <TextInput value={text} onChangeText={setText} style={[styles.input, styles.bodyInput]} multiline textAlignVertical="top" />

                    <View style={styles.actions}>
                      <PrimaryButton label="Copy" variant="secondary" onPress={copy} style={styles.action} />
                      {channel === 'email' ? <PrimaryButton label={prospect.email ? 'Email' : 'Email (no address)'} onPress={sendEmail} style={styles.action} /> : null}
                      {channel === 'phone' && prospect.phone ? <PrimaryButton label="Call" onPress={() => openUrl(buildTelUrl(prospect.phone), 'Could not start the call')} style={styles.action} /> : null}
                      {channel === 'text' && prospect.phone ? <PrimaryButton label="Text" onPress={() => openUrl(`sms:${prospect.phone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(text)}`, 'Could not open messages')} style={styles.action} /> : null}
                      {channel === 'in_person' || (channel === 'phone' && !prospect.phone) || (channel === 'text' && !prospect.phone) ? <PrimaryButton label="Share…" onPress={share} style={styles.action} /> : null}
                    </View>
                    <PrimaryButton label={`I contacted them (${CHANNEL_LABELS[channel]})`} variant="secondary" onPress={markContacted} style={{ marginTop: spacing.sm }} />
                  </>
                ) : null}

                {prospect.website ? <PrimaryButton label="Open their website" variant="secondary" onPress={() => openUrl(normalizeWebsite(prospect.website), 'Could not open the website')} style={{ marginTop: spacing.sm }} /> : null}

                <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>STATUS · {PROSPECT_STATUS_LABELS[status]}</Text>
                <View style={styles.actions}>
                  <PrimaryButton label="They enrolled" onPress={markEnrolled} style={styles.action} disabled={status === PROSPECT_STATUS.ENROLLED} />
                  <PrimaryButton label="Declined" variant="secondary" onPress={markDeclined} style={styles.action} />
                  <PrimaryButton label="Dismiss" variant="secondary" onPress={() => { update(prospect.id, { status: PROSPECT_STATUS.DISMISSED }); onClose(); }} style={styles.action} />
                </View>
                {prospect.incentive ? <Text style={styles.hint}>Incentive recorded: ${prospect.incentive.amountUSD.toFixed(2)}{prospect.incentive.appliesTo ? ` off ${prospect.incentive.appliesTo}` : ' off'} on {new Date(prospect.incentive.grantedAt).toLocaleDateString()}.</Text> : null}
                {(prospect.outreachLog || []).length > 0 ? (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>CONTACT LOG</Text>
                    {prospect.outreachLog.map((l) => <Text key={l.id} style={styles.reason}>{new Date(l.at).toLocaleString()} · {CHANNEL_LABELS[l.channel] || l.channel}{l.note ? ` · ${l.note}` : ''}</Text>)}
                  </>
                ) : null}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function PartnerFinderScreen() {
  const insets      = useSafeAreaInsets();
  const appSettings = useStore((s) => s.appSettings);
  const places      = useStore((s) => s.places);
  const prospects   = useStore((s) => s.partnerProspects);
  const save        = useStore((s) => s.savePartnerProspects);
  const update      = useStore((s) => s.updatePartnerProspect);
  const { location } = useUserLocation({ autoRequest: true });

  const [area, setArea]           = useState('');
  const [cats, setCats]           = useState(['food', 'fuel']);
  const [radius, setRadiusMiles]  = useState(1);
  const [busy, setBusy]           = useState(false);
  const [ranking, setRanking]     = useState(false);
  const [error, setError]         = useState(null);
  const [resultIds, setResultIds] = useState(null);   // ids from the latest search (null = show saved)
  const [showHidden, setShowHidden] = useState(false);
  const [openId, setOpenId]       = useState(null);
  const [ai, setAi]               = useState({});     // { [id]: { priority, reason } } for this session
  const [searchedFrom, setSearchedFrom] = useState(null);

  const offer = incentiveText(appSettings);
  const aiReady = isOllamaReady(appSettings);

  const toggleCat = (k) => setCats((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  const search = useCallback(async () => {
    setError(null); setBusy(true);
    try {
      let origin = location ? { latitude: location.latitude, longitude: location.longitude, label: 'your location' } : null;
      if (area.trim()) {
        const hits = await searchAddress(area.trim(), { limit: 1 });
        if (!hits[0]) throw new Error(`Could not find "${area.trim()}". Try a fuller address or city.`);
        origin = { latitude: hits[0].latitude, longitude: hits[0].longitude, label: hits[0].formattedAddress || area.trim() };
      }
      if (!origin) throw new Error('Allow location access, or type an address or city to search near.');
      const found = await findBusinesses({ latitude: origin.latitude, longitude: origin.longitude, radiusMiles: radius, categoryKeys: cats, baseUrl: appSettings.overpassBaseUrl });
      const scored = found.map((b) => { const fit = scoreProspect(b, { existingPlaces: places }); return { ...b, fit: { points: fit.points, reasons: fit.reasons }, onMapPlaceId: fit.onMap?.id || null }; });
      save(scored);
      setResultIds(scored.map((b) => b.id));
      setSearchedFrom(origin.label);
      setAi({});
      if (scored.length === 0) setError('No named businesses found in that area for the selected categories.');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }, [area, cats, radius, location, appSettings.overpassBaseUrl, places, save]);

  const rows = useMemo(() => {
    const all = Object.values(prospects);
    const pool = resultIds ? resultIds.map((id) => prospects[id]).filter(Boolean) : all;
    return pool
      .filter((p) => showHidden || (p.status !== PROSPECT_STATUS.DISMISSED && p.status !== PROSPECT_STATUS.DECLINED))
      .map((p) => ({ ...p, ai: ai[p.id] || null }))
      .sort((a, b) => (b.ai?.priority ?? 0) - (a.ai?.priority ?? 0) || (b.fit?.points ?? 0) - (a.fit?.points ?? 0) || (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  }, [prospects, resultIds, ai, showHidden]);

  const rankWithAi = useCallback(async () => {
    setRanking(true); setError(null);
    try { setAi(await rankProspects(rows.filter((p) => p.onMapPlaceId == null), appSettings)); }
    catch (err) { setError(`AI ranking failed: ${err.message}`); }
    finally { setRanking(false); }
  }, [rows, appSettings]);

  const openProspect = openId ? { ...prospects[openId], ai: ai[openId] || null } : null;

  const renderItem = ({ item }) => {
    const st = STATUS_STYLE[item.status] || STATUS_STYLE[PROSPECT_STATUS.NEW];
    return (
      <Pressable onPress={() => setOpenId(item.id)} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={styles.fit}><Text style={styles.fitValue}>{item.fit?.points ?? 0}</Text><Text style={styles.fitLabel}>fit</Text></View>
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>{item.categoryLabel}{item.brand ? ` · ${item.brand}` : ''} · {miles(item.distanceMeters ?? 0)}</Text>
          <View style={styles.badges}>
            {item.onMapPlaceId ? <Text style={styles.badge}>Already on map</Text> : null}
            {item.toilets === 'yes' || item.toilets === 'customers' ? <Text style={styles.badge}>Toilets listed</Text> : null}
            {item.email ? <Text style={styles.badge}>Email</Text> : item.phone ? <Text style={styles.badge}>Phone</Text> : null}
            {item.ai ? <Text style={[styles.badge, styles.badgeAi]}>AI {item.ai.priority}/5</Text> : null}
          </View>
          {item.ai?.reason ? <Text style={styles.aiReason} numberOfLines={2}>{item.ai.reason}</Text> : null}
        </View>
        <View style={[styles.pill, { backgroundColor: st.bg }]}><Text style={[styles.pillText, { color: st.text }]}>{PROSPECT_STATUS_LABELS[item.status]}</Text></View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
        ListHeaderComponent={(
          <View>
            <Text style={styles.intro}>
              Finds real businesses near a location from OpenStreetMap, scores how good a first partner each looks (rules shown per business), and writes first-contact suggestions from what they sell.
              {offer ? ` Businesses that enroll their own restroom are offered ${offer}.` : ''}
            </Text>
            <Text style={styles.label}>SEARCH NEAR</Text>
            <TextInput value={area} onChangeText={setArea} style={styles.input} placeholder={location ? 'Your current location (or type an address or city)' : 'Type an address or city'} placeholderTextColor={colors.placeholder} returnKeyType="search" onSubmitEditing={search} />
            <Text style={styles.label}>CATEGORIES</Text>
            <View style={styles.chips}>
              {PROSPECT_CATEGORY_ORDER.map((k) => <Chip key={k} label={PROSPECT_CATEGORIES[k].label} active={cats.includes(k)} onPress={() => toggleCat(k)} />)}
            </View>
            <Text style={styles.label}>RADIUS</Text>
            <View style={styles.chips}>
              {SEARCH_RADIUS_OPTIONS_MILES.map((r) => <Chip key={r} label={`${r} mi`} active={radius === r} onPress={() => setRadiusMiles(r)} />)}
            </View>
            <PrimaryButton label={busy ? 'Searching…' : 'Find businesses'} onPress={search} loading={busy} style={{ marginTop: spacing.md }} />
            {error ? <Text style={styles.error}>{error}</Text> : null}

            {rows.length > 0 ? (
              <View style={styles.resultsHead}>
                <Text style={styles.resultsTitle}>{rows.length} business{rows.length === 1 ? '' : 'es'}{searchedFrom ? ` near ${searchedFrom.length > 40 ? `${searchedFrom.slice(0, 40)}…` : searchedFrom}` : ' saved'}</Text>
                <View style={styles.resultsActions}>
                  <Pressable onPress={() => setShowHidden((v) => !v)} accessibilityRole="button"><Text style={styles.link}>{showHidden ? 'Hide dismissed' : 'Show dismissed'}</Text></Pressable>
                  <Pressable onPress={rankWithAi} disabled={!aiReady || ranking} accessibilityRole="button" style={[styles.aiButton, (!aiReady || ranking) && styles.aiButtonDisabled]}>
                    {ranking ? <ActivityIndicator size="small" color={colors.textOnDark} /> : <Text style={styles.aiButtonText}>Rank with AI</Text>}
                  </Pressable>
                </View>
              </View>
            ) : null}
            {rows.length > 0 && !aiReady ? <Text style={styles.hint}>Set an Ollama URL and a Partner Outreach (or Text Moderation) model in Admin Settings to rank with AI. Drafts still work with the built-in template.</Text> : null}
          </View>
        )}
        ListEmptyComponent={!busy && !error ? (
          <View style={styles.empty}><Ionicons name="storefront-outline" size={32} color={colors.textSecondary} /><Text style={styles.emptyTitle}>Search to find partners</Text></View>
        ) : null}
      />
      {openProspect ? <ProspectSheet key={openProspect.id} prospect={openProspect} onClose={() => setOpenId(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.adminSurface },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  intro: { ...typography.caption, marginBottom: spacing.md },
  label: { ...typography.adminSectionHeader, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...typography.body },
  bodyInput: { minHeight: 180 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { ...typography.caption, color: colors.modRejectedText, marginTop: spacing.sm },
  hint: { ...typography.caption, marginTop: spacing.xs },
  resultsHead: { marginTop: spacing.lg, marginBottom: spacing.xs },
  resultsTitle: { ...typography.subheading },
  resultsActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  link: { ...typography.caption, color: colors.primary, textDecorationLine: 'underline' },
  aiButton: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 110, alignItems: 'center' },
  aiButtonDisabled: { opacity: 0.4 },
  aiButtonText: { ...typography.badge, color: colors.textOnDark },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.adminBorder, padding: spacing.md },
  pressed: { opacity: 0.85 },
  fit: { width: 40, alignItems: 'center' },
  fitValue: { ...typography.subheading },
  fitLabel: { ...typography.label },
  rowText: { flex: 1 },
  name: { ...typography.bodyMedium },
  meta: { ...typography.label, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  badge: { ...typography.label, backgroundColor: colors.adminSurface, borderRadius: radius.sm, paddingHorizontal: spacing.xs, overflow: 'hidden' },
  badgeAi: { backgroundColor: colors.modFlaggedBg, color: colors.modFlaggedText },
  aiReason: { ...typography.label, marginTop: spacing.xs },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pillText: { ...typography.badge },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.subheading },
  // sheet
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, ...shadows.floating },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sheetTitle: { ...typography.subheading },
  sheetCaption: { ...typography.caption, marginBottom: spacing.sm },
  sectionLabel: { ...typography.adminSectionHeader, marginTop: spacing.md, marginBottom: spacing.xs },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  factText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  reason: { ...typography.caption, marginBottom: 2 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.adminSurface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  offerText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  offerStrong: { fontWeight: '700' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1 },
});

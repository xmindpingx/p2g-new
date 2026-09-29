// places2go — CoBrandingPlaceScreen (admin only)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// One place's partnership listing:
//   1. Status            — not contacted → contacted → in discussion → active / paused / declined
//   2. Business lookup   — what OpenStreetMap holds for this business (website,
//                          phone, email, hours, operator, brand, toilets tag);
//                          pick the matching OSM feature; copy details into the
//                          contact fields; open / call / email.
//   3. From submissions  — review count and average, confirmed amenities,
//                          visible review excerpts (the data the templates use).
//   4. Outreach          — templates that apply to this place, rendered from
//                          the real data, editable, sent by email or the share
//                          sheet, then logged.
//   5. Partner banner    — enabled, headline, courtesy message, suggested
//                          items, placements, live preview.
//   6. Outreach log & notes.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Switch, Share, Linking, Alert, Modal, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius, fonts, fontSizes, shadows } from '../theme';
import useStore from '../store/useStore';
import {
  PARTNERSHIP_STATUS, PARTNERSHIP_STATUS_LABELS, PARTNERSHIP_STATUS_ORDER,
  OUTREACH_CHANNEL, OUTREACH_CHANNEL_LABELS, OUTREACH_CHANNEL_ORDER, COBRANDING_LIMITS,
} from '../constants/cobranding';
import { lookupBusiness } from '../services/nominatim';
import { buildPlaceInsights, getActivePlaceBanner, buildMailtoUrl, buildTelUrl, normalizeWebsite, formatDateLong } from '../utils/cobranding';
import { getApplicableTemplates } from '../utils/cobrandingTemplates';
import PrimaryButton from '../components/PrimaryButton';
import PartnerBanner from '../components/PartnerBanner';
import { Chip } from '../components/FilterChips';

const fmt = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------
function Section({ title, children, caption = null }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function LookupField({ label, value, onUse, onOpen }) {
  return (
    <View style={styles.lookupRow}>
      <View style={styles.lookupText}>
        <Text style={styles.lookupLabel}>{label}</Text>
        <Text style={[styles.lookupValue, !value && styles.lookupMissing]}>{value || 'Not listed on OpenStreetMap'}</Text>
      </View>
      {value && onOpen ? (
        <Pressable onPress={onOpen} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Open ${label}`}>
          <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
      {value && onUse ? (
        <Pressable onPress={onUse} style={styles.useButton} accessibilityRole="button">
          <Text style={styles.useButtonText}>Use</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ContactField({ label, value, onCommit, keyboardType = 'default', placeholder }) {
  const [text, setText] = useState(value || '');
  useEffect(() => { setText(value || ''); }, [value]);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={() => { if (text !== (value || '')) onCommit(text); }}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        maxLength={COBRANDING_LIMITS.contactFieldMaxLength}
      />
    </View>
  );
}

// Template preview / edit / send
function TemplateSheet({ template, contactEmail, onClose, onLogged }) {
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState(template?.subject || '');
  const [body, setBody]       = useState(template?.body || '');
  const [note, setNote]       = useState('');
  useEffect(() => { setSubject(template?.subject || ''); setBody(template?.body || ''); }, [template]);
  if (!template) return null;

  const sendEmail = async () => {
    const url = buildMailtoUrl({ to: contactEmail || '', subject, body });
    try {
      await Linking.openURL(url);
      onLogged({ channel: OUTREACH_CHANNEL.EMAIL, templateKey: template.key, subject, note });
    } catch (err) {
      Alert.alert('No mail app', 'Could not open a mail app. Use Share instead.');
    }
  };
  const share = async () => {
    try {
      const result = await Share.share({ title: subject, subject, message: `${subject}\n\n${body}` });
      if (result.action !== Share.dismissedAction) onLogged({ channel: OUTREACH_CHANNEL.SHARE, templateKey: template.key, subject, note });
    } catch (err) {
      Alert.alert('Could not share', err.message);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg, maxHeight: '88%' }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{template.label}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close"><Ionicons name="close" size={22} color={colors.textPrimary} /></Pressable>
          </View>
          <Text style={styles.sheetCaption}>{template.description} Edit anything before sending.</Text>
          <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Subject</Text>
            <TextInput value={subject} onChangeText={setSubject} style={styles.input} />
            <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Message</Text>
            <TextInput value={body} onChangeText={setBody} style={[styles.input, styles.bodyInput]} multiline textAlignVertical="top" />
            <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Internal note for the log (optional)</Text>
            <TextInput value={note} onChangeText={setNote} style={styles.input} placeholder="e.g. spoke to the manager first" placeholderTextColor={colors.placeholder} maxLength={COBRANDING_LIMITS.outreachNoteMaxLength} />
          </ScrollView>
          <View style={styles.actions}>
            <PrimaryButton label="Share…" variant="secondary" onPress={share} style={styles.action} />
            <PrimaryButton label={contactEmail ? 'Email' : 'Email (no address)'} onPress={sendEmail} style={styles.action} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function CoBrandingPlaceScreen({ navigation, route }) {
  const insets  = useSafeAreaInsets();
  const placeId = route.params?.placeId;

  const place             = useStore((s) => s.places.find((p) => p.id === placeId) || null);
  const reviews           = useStore((s) => s.reviews);
  const moderationQueue   = useStore((s) => s.moderationQueue);
  const appSettings       = useStore((s) => s.appSettings);
  const officialAmenities = useStore((s) => s.officialAmenities);
  const profile           = useStore((s) => s.coBranding[placeId] || null);

  const ensureCoBranding        = useStore((s) => s.ensureCoBranding);
  const setPartnershipStatus    = useStore((s) => s.setPartnershipStatus);
  const setCoBrandingLookup     = useStore((s) => s.setCoBrandingLookup);
  const updateCoBrandingContact = useStore((s) => s.updateCoBrandingContact);
  const updateCoBrandingNotes   = useStore((s) => s.updateCoBrandingNotes);
  const updateCoBrandingBanner  = useStore((s) => s.updateCoBrandingBanner);
  const addCoBrandingItem       = useStore((s) => s.addCoBrandingItem);
  const removeCoBrandingItem    = useStore((s) => s.removeCoBrandingItem);
  const logOutreach             = useStore((s) => s.logOutreach);

  const [lookingUp, setLookingUp]   = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [warnings, setWarnings]     = useState([]);
  const [template, setTemplate]     = useState(null);
  const [itemName, setItemName]     = useState('');
  const [itemPrice, setItemPrice]   = useState('');
  const [headline, setHeadline]     = useState('');
  const [courtesy, setCourtesy]     = useState('');
  const [notes, setNotes]           = useState('');
  const [logChannel, setLogChannel] = useState(null);
  const [logNote, setLogNote]       = useState('');

  // Create the profile on first open
  useEffect(() => {
    if (place && !profile) {
      try { ensureCoBranding(placeId); } catch (err) { Alert.alert('Admin only', err.message); navigation.goBack(); }
    }
  }, [place, profile, placeId, ensureCoBranding, navigation]);

  useEffect(() => {
    if (!profile) return;
    setHeadline(profile.banner.headline || '');
    setCourtesy(profile.banner.courtesyMessage || '');
    setNotes(profile.notes || '');
  }, [profile?.placeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const insights = useMemo(
    () => (place ? buildPlaceInsights({ place, reviews, moderationQueue, appSettings, officialAmenities }) : null),
    [place, reviews, moderationQueue, appSettings, officialAmenities],
  );
  const templates = useMemo(
    () => (place && profile ? getApplicableTemplates({ place, insights, profile, appSettings }) : []),
    [place, insights, profile, appSettings],
  );
  const banner = useMemo(() => getActivePlaceBanner(profile, appSettings), [profile, appSettings]);

  const runLookup = useCallback(async () => {
    if (!place) return;
    setLookingUp(true); setLookupError(null); setWarnings([]);
    try {
      const result = await lookupBusiness({ latitude: place.latitude, longitude: place.longitude, name: place.name });
      setCandidates(result.candidates);
      setWarnings(result.warnings);
      if (result.candidates.length === 0) {
        setLookupError('OpenStreetMap has no feature at this pin or matching this name.');
      } else {
        setCoBrandingLookup(placeId, { ...result.candidates[0], fetchedAt: result.fetchedAt });
      }
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setLookingUp(false);
    }
  }, [place, placeId, setCoBrandingLookup]);

  // First open with no lookup yet → run one automatically
  useEffect(() => {
    if (place && profile && !profile.business.lookup && !lookingUp && candidates.length === 0 && !lookupError) runLookup();
  }, [place, profile, lookingUp, candidates.length, lookupError, runLookup]);

  const lookup  = profile?.business?.lookup || null;
  const contact = profile?.business || {};

  const handleLogged = useCallback((entry) => {
    setTemplate(null);
    try { logOutreach(placeId, entry); } catch (err) { Alert.alert('Not logged', err.message); }
  }, [logOutreach, placeId]);

  const addItem = () => {
    try { addCoBrandingItem(placeId, { name: itemName, price: itemPrice }); setItemName(''); setItemPrice(''); }
    catch (err) { Alert.alert('Not added', err.message); }
  };

  const addManualLog = () => {
    if (!logChannel) return;
    try { logOutreach(placeId, { channel: logChannel, note: logNote }); setLogChannel(null); setLogNote(''); }
    catch (err) { Alert.alert('Not logged', err.message); }
  };

  if (!place || !profile) {
    return (
      <View style={styles.missing}>
        <Text style={typography.subheading}>{place ? 'Loading…' : 'Place not found'}</Text>
        {!place ? <PrimaryButton label="Go back" variant="secondary" onPress={() => navigation.goBack()} style={styles.missingButton} /> : null}
      </View>
    );
  }

  const openUrl = (url) => Linking.openURL(url).catch(() => Alert.alert('Could not open', url));

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <Text style={styles.name}>{place.name}</Text>
        <Text style={styles.address}>{place.address || 'No address'}{place.hasPublicRestroom === false ? ' · listed as no public restroom' : ''}</Text>

        {/* 1. Status */}
        <Section title="Partnership status">
          <View style={styles.chips}>
            {PARTNERSHIP_STATUS_ORDER.map((s) => (
              <Chip key={s} label={PARTNERSHIP_STATUS_LABELS[s]} active={profile.status === s} onPress={() => { try { setPartnershipStatus(placeId, s); } catch (err) { Alert.alert(err.message); } }} />
            ))}
          </View>
          {profile.status === PARTNERSHIP_STATUS.ACTIVE && !banner ? (
            <Text style={styles.hint}>Active partner, but no banner is showing yet — switch it on and add a headline or an item below.</Text>
          ) : null}
        </Section>

        {/* 2. Business lookup */}
        <Section title="Business information" caption="Looked up on OpenStreetMap at the pin and by name. Only what OSM actually holds is shown.">
          {lookup ? (
            <>
              <Text style={styles.lookupHead}>{lookup.name || lookup.displayName}</Text>
              <Text style={styles.lookupSub}>
                {[lookup.category, lookup.type].filter(Boolean).join(' / ') || 'feature'} · OSM {lookup.osmType} {lookup.osmId} · fetched {fmt(lookup.fetchedAt)}
              </Text>
              <LookupField label="Website" value={lookup.business.website} onUse={() => updateCoBrandingContact(placeId, { website: lookup.business.website })} onOpen={() => openUrl(normalizeWebsite(lookup.business.website))} />
              <LookupField label="Phone"   value={lookup.business.phone}   onUse={() => updateCoBrandingContact(placeId, { contactPhone: lookup.business.phone })} onOpen={() => openUrl(buildTelUrl(lookup.business.phone))} />
              <LookupField label="Email"   value={lookup.business.email}   onUse={() => updateCoBrandingContact(placeId, { contactEmail: lookup.business.email })} onOpen={() => openUrl(buildMailtoUrl({ to: lookup.business.email }))} />
              <LookupField label="Opening hours" value={lookup.business.openingHours} />
              <LookupField label="Operator / brand" value={[lookup.business.operator, lookup.business.brand].filter(Boolean).join(' · ') || null} />
              <LookupField label="OSM toilets tag" value={lookup.business.toilets ? `${lookup.business.toilets}${lookup.business.toiletsAccess ? ` (access: ${lookup.business.toiletsAccess})` : ''}${lookup.business.toiletsWheelchair ? ` · wheelchair: ${lookup.business.toiletsWheelchair}` : ''}` : null} />
              <LookupField label="Address on OSM" value={lookup.formattedAddress || lookup.displayName} />
            </>
          ) : (
            <Text style={styles.hint}>{lookingUp ? 'Looking up on OpenStreetMap…' : 'No lookup yet.'}</Text>
          )}
          {lookupError ? <Text style={styles.error}>{lookupError}</Text> : null}
          {warnings.map((w) => <Text key={w} style={styles.hint}>{w}</Text>)}
          {candidates.length > 1 ? (
            <>
              <Text style={styles.fieldLabel}>Other OSM features found — tap to use instead</Text>
              <View style={styles.chips}>
                {candidates.map((c) => (
                  <Chip
                    key={`${c.osmType}/${c.osmId}`}
                    label={`${c.name || c.type || 'feature'}${c.source === 'at_pin' ? ' (at pin)' : ''}`}
                    active={lookup && lookup.osmId === c.osmId && lookup.osmType === c.osmType}
                    onPress={() => setCoBrandingLookup(placeId, { ...c, fetchedAt: new Date().toISOString() })}
                  />
                ))}
              </View>
            </>
          ) : null}
          <PrimaryButton label={lookingUp ? 'Looking up…' : lookup ? 'Look up again' : 'Look up on OpenStreetMap'} variant="secondary" onPress={runLookup} loading={lookingUp} style={styles.button} />

          <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Contact details (yours to edit)</Text>
          <ContactField label="Contact name" value={contact.contactName} onCommit={(v) => updateCoBrandingContact(placeId, { contactName: v })} placeholder="Owner or manager" />
          <ContactField label="Email"        value={contact.contactEmail} onCommit={(v) => updateCoBrandingContact(placeId, { contactEmail: v })} keyboardType="email-address" placeholder="name@business.com" />
          <ContactField label="Phone"        value={contact.contactPhone} onCommit={(v) => updateCoBrandingContact(placeId, { contactPhone: v })} keyboardType="phone-pad" placeholder="+1 …" />
          <ContactField label="Website"      value={contact.website}      onCommit={(v) => updateCoBrandingContact(placeId, { website: v })} keyboardType="url" placeholder="https://" />
          <View style={styles.contactActions}>
            {contact.contactPhone ? <Chip label="Call" trailingIcon="call-outline" onPress={() => openUrl(buildTelUrl(contact.contactPhone))} /> : null}
            {contact.contactEmail ? <Chip label="Email" trailingIcon="mail-outline" onPress={() => openUrl(buildMailtoUrl({ to: contact.contactEmail }))} /> : null}
            {contact.website ? <Chip label="Website" trailingIcon="open-outline" onPress={() => openUrl(normalizeWebsite(contact.website))} /> : null}
          </View>
        </Section>

        {/* 3. Insights */}
        <Section title="From submissions" caption="What the outreach templates are built from. Hidden or under-review review text is never used.">
          <View style={styles.insightRow}><Text style={styles.insightLabel}>Reviews</Text><Text style={styles.insightValue}>{insights.reviewCount > 0 ? `${insights.reviewCount} · average ${insights.averageRating.toFixed(1)}` : 'None yet'}</Text></View>
          <View style={styles.insightRow}><Text style={styles.insightLabel}>Photos</Text><Text style={styles.insightValue}>{insights.photoCount}</Text></View>
          <View style={styles.insightRow}><Text style={styles.insightLabel}>Last reviewed</Text><Text style={styles.insightValue}>{insights.lastReviewedAt ? formatDateLong(insights.lastReviewedAt) : '—'}</Text></View>
          <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Confirmed amenities ({insights.confirmedAmenities.length})</Text>
          <Text style={styles.body}>{insights.confirmedAmenities.length ? insights.confirmedAmenities.join(', ') : 'None marked.'}</Text>
          {insights.positiveExcerpts.length ? (<><Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Positive comments</Text>{insights.positiveExcerpts.map((t, i) => <Text key={i} style={styles.quote}>"{t}"</Text>)}</>) : null}
          {insights.concernExcerpts.length ? (<><Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Concerns</Text>{insights.concernExcerpts.map((t, i) => <Text key={i} style={styles.quote}>"{t}"</Text>)}</>) : null}
        </Section>

        {/* 4. Templates */}
        <Section title="Suggested outreach" caption={templates.length ? 'Templates that apply to this place right now. Tap to preview, edit and send.' : 'No template applies yet.'}>
          {templates.map((t) => (
            <Pressable key={t.key} onPress={() => setTemplate(t)} accessibilityRole="button" style={({ pressed }) => [styles.templateRow, pressed && styles.pressed]}>
              <View style={styles.templateText}>
                <Text style={styles.templateLabel}>{t.label}</Text>
                <Text style={styles.templateDesc}>{t.description}</Text>
                <Text style={styles.templateSubject} numberOfLines={1}>{t.subject}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          ))}
          {!appSettings.cobrandingSenderName ? <Text style={styles.hint}>Set "Outreach Sender Name" in Admin Settings → Co-branding so templates are signed with your name.</Text> : null}
        </Section>

        {/* 5. Banner */}
        <Section title="Partner banner" caption={`Shown to users only while the status is "Active partner", the banner is on, and it has a headline or an item. ${appSettings.cobrandingEnabled ? '' : 'Partner banners are currently switched off app-wide in Admin Settings.'}`}>
          <View style={styles.switchRow}>
            <Text style={styles.body}>Banner enabled</Text>
            <Switch value={profile.banner.enabled} onValueChange={(v) => updateCoBrandingBanner(placeId, { enabled: v })} trackColor={{ true: colors.success, false: colors.border }} thumbColor={colors.surface} />
          </View>
          <Text style={styles.fieldLabel}>Headline ({headline.length}/{appSettings.cobrandingHeadlineMaxLength})</Text>
          <TextInput value={headline} onChangeText={(t) => setHeadline(t.slice(0, appSettings.cobrandingHeadlineMaxLength))} onBlur={() => updateCoBrandingBanner(placeId, { headline })} placeholder="e.g. Fresh coffee at the counter" placeholderTextColor={colors.placeholder} style={styles.input} />
          <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Courtesy message (blank = app default)</Text>
          <TextInput value={courtesy} onChangeText={(t) => setCourtesy(t.slice(0, COBRANDING_LIMITS.courtesyMessageMaxLength))} onBlur={() => updateCoBrandingBanner(placeId, { courtesyMessage: courtesy })} placeholder={appSettings.cobrandingCourtesyMessage} placeholderTextColor={colors.placeholder} style={[styles.input, styles.multiline]} multiline textAlignVertical="top" />

          <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Suggested items ({profile.banner.items.length}/{appSettings.cobrandingMaxSuggestedItems})</Text>
          {profile.banner.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.body}>{item.name}{item.price ? ` — ${item.price}` : ''}</Text>
              <Pressable onPress={() => removeCoBrandingItem(placeId, item.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`}>
                <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
          {profile.banner.items.length < appSettings.cobrandingMaxSuggestedItems ? (
            <View style={styles.addItemRow}>
              <TextInput value={itemName} onChangeText={setItemName} placeholder="Item, e.g. Coffee" placeholderTextColor={colors.placeholder} style={[styles.input, { flex: 2 }]} maxLength={COBRANDING_LIMITS.itemNameMaxLength} />
              <TextInput value={itemPrice} onChangeText={setItemPrice} placeholder="Price" placeholderTextColor={colors.placeholder} style={[styles.input, { flex: 1 }]} maxLength={COBRANDING_LIMITS.itemPriceMaxLength} />
              <Pressable onPress={addItem} disabled={!itemName.trim()} style={[styles.addButton, !itemName.trim() && styles.disabled]} accessibilityRole="button" accessibilityLabel="Add item">
                <Ionicons name="add" size={22} color={colors.textOnDark} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.switchRow}>
            <Text style={styles.body}>Show on the place page</Text>
            <Switch value={profile.banner.showOnDetails !== false} onValueChange={(v) => updateCoBrandingBanner(placeId, { showOnDetails: v })} trackColor={{ true: colors.success, false: colors.border }} thumbColor={colors.surface} />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.body}>Show on the directions screen</Text>
            <Switch value={profile.banner.showOnNavigation !== false} onValueChange={(v) => updateCoBrandingBanner(placeId, { showOnNavigation: v })} trackColor={{ true: colors.success, false: colors.border }} thumbColor={colors.surface} />
          </View>

          <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Preview {banner ? '(live)' : '(not live — see conditions above)'}</Text>
          <PartnerBanner
            banner={{
              headline,
              courtesyMessage: courtesy.trim() || appSettings.cobrandingCourtesyMessage,
              items: profile.banner.items,
            }}
          />
        </Section>

        {/* 6. Log & notes */}
        <Section title="Outreach log" caption="Emails and shares are logged automatically. Add calls or visits here.">
          <View style={styles.chips}>
            {OUTREACH_CHANNEL_ORDER.filter((c) => c !== OUTREACH_CHANNEL.SHARE).map((c) => (
              <Chip key={c} label={OUTREACH_CHANNEL_LABELS[c]} active={logChannel === c} onPress={() => setLogChannel(logChannel === c ? null : c)} />
            ))}
          </View>
          {logChannel ? (
            <View style={styles.addItemRow}>
              <TextInput value={logNote} onChangeText={setLogNote} placeholder="What happened?" placeholderTextColor={colors.placeholder} style={[styles.input, { flex: 1 }]} maxLength={COBRANDING_LIMITS.outreachNoteMaxLength} />
              <Pressable onPress={addManualLog} style={styles.addButton} accessibilityRole="button" accessibilityLabel="Log outreach"><Ionicons name="checkmark" size={22} color={colors.textOnDark} /></Pressable>
            </View>
          ) : null}
          {profile.outreachLog.length === 0 ? <Text style={styles.hint}>Nothing logged yet.</Text> : null}
          {profile.outreachLog.map((e) => (
            <View key={e.id} style={styles.logRow}>
              <Ionicons name={e.channel === OUTREACH_CHANNEL.EMAIL ? 'mail-outline' : e.channel === OUTREACH_CHANNEL.PHONE ? 'call-outline' : e.channel === OUTREACH_CHANNEL.IN_PERSON ? 'walk-outline' : 'share-outline'} size={16} color={colors.textSecondary} />
              <View style={styles.logText}>
                <Text style={styles.logTitle}>{OUTREACH_CHANNEL_LABELS[e.channel] || e.channel}{e.subject ? ` · ${e.subject}` : ''}</Text>
                <Text style={styles.logMeta}>{fmt(e.sentAt)}{e.note ? ` · ${e.note}` : ''}</Text>
              </View>
            </View>
          ))}
          <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Internal notes</Text>
          <TextInput value={notes} onChangeText={(t) => setNotes(t.slice(0, COBRANDING_LIMITS.notesMaxLength))} onBlur={() => updateCoBrandingNotes(placeId, notes)} placeholder="Anything the next admin should know" placeholderTextColor={colors.placeholder} style={[styles.input, styles.multiline]} multiline textAlignVertical="top" />
        </Section>
      </ScrollView>

      <TemplateSheet template={template} contactEmail={contact.contactEmail} onClose={() => setTemplate(null)} onLogged={handleLogged} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.adminSurface },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  name: { ...typography.heading },
  address: { ...typography.caption, marginTop: 2 },
  section: { marginTop: spacing.lg },
  sectionTitle: { ...typography.adminSectionHeader, marginBottom: spacing.xs },
  sectionCaption: { ...typography.label, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.adminBorder, padding: spacing.lg, gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { ...typography.caption },
  error: { ...typography.caption, color: colors.modRejectedText },
  body: { ...typography.body },
  quote: { ...typography.caption, color: colors.textPrimary, fontStyle: 'italic', marginTop: 2 },
  button: { marginTop: spacing.xs },
  lookupHead: { ...typography.bodyMedium },
  lookupSub: { ...typography.label },
  lookupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  lookupText: { flex: 1 },
  lookupLabel: { ...typography.label },
  lookupValue: { ...typography.caption, color: colors.textPrimary },
  lookupMissing: { color: colors.textSecondary, fontStyle: 'italic' },
  useButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.chipInactiveBg },
  useButtonText: { ...typography.badge, color: colors.chipInactiveText },
  fieldRow: { gap: spacing.xs },
  fieldLabel: { ...typography.label },
  input: { minHeight: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontFamily: fonts.regular, fontSize: fontSizes.md, color: colors.textPrimary },
  multiline: { minHeight: 72 },
  bodyInput: { minHeight: 260 },
  contactActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  insightRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  insightLabel: { ...typography.caption },
  insightValue: { ...typography.captionMedium, color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },
  templateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  pressed: { opacity: 0.85 },
  templateText: { flex: 1 },
  templateLabel: { ...typography.bodyMedium },
  templateDesc: { ...typography.label, marginTop: 2 },
  templateSubject: { ...typography.caption, marginTop: 2, color: colors.textPrimary },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  addItemRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  addButton: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  logRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', paddingVertical: spacing.xs },
  logText: { flex: 1 },
  logTitle: { ...typography.captionMedium, color: colors.textPrimary },
  logMeta: { ...typography.label },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, ...shadows.floating },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { ...typography.subheading },
  sheetCaption: { ...typography.caption, marginTop: spacing.xs, marginBottom: spacing.md },
  sheetScroll: { flexGrow: 0 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.adminSurface },
  missingButton: { marginTop: spacing.lg, alignSelf: 'stretch' },
});

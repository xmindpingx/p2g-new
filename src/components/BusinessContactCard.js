// places2go — BusinessContactCard (admin)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// On a submission the admin is reviewing: look the business up on
// OpenStreetMap (at the pin and by name), show the phone / email / website OSM
// actually holds, and offer a ready-to-send inquiry template so the admin can
// confirm the report with the business before approving or denying. Contact
// details found here are also saved to the place's co-branding profile.

import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Linking, Share, StyleSheet } from 'react-native';
import { showAlert } from '../utils/alert';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { colors, typography, spacing, radius } from '../theme';
import useStore from '../store/useStore';
import { lookupBusiness } from '../services/nominatim';
import { buildMailtoUrl, buildTelUrl, normalizeWebsite } from '../utils/cobranding';
import { buildVerificationInquiry } from '../utils/cobrandingTemplates';
import { Chip } from './FilterChips';

export default function BusinessContactCard({ place, kind = 'restroom', style }) {
  const appSettings = useStore((s) => s.appSettings);
  const profile     = useStore((s) => s.coBranding[place?.id] || null);
  const ensureCoBranding    = useStore((s) => s.ensureCoBranding);
  const setCoBrandingLookup = useStore((s) => s.setCoBrandingLookup);
  const updateCoBrandingContact = useStore((s) => s.updateCoBrandingContact);
  const logOutreach         = useStore((s) => s.logOutreach);

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);

  const lookup  = profile?.business?.lookup || null;
  const phone   = profile?.business?.contactPhone || lookup?.business?.phone || null;
  const email   = profile?.business?.contactEmail || lookup?.business?.email || null;
  const website = profile?.business?.website      || lookup?.business?.website || null;

  const run = useCallback(async () => {
    if (!place) return;
    setBusy(true); setError(null);
    try {
      ensureCoBranding(place.id);
      const result = await lookupBusiness({ latitude: place.latitude, longitude: place.longitude, name: place.name });
      const best = result.candidates[0] || null;
      if (!best) { setError('OpenStreetMap has no feature at this pin or matching this name.'); return; }
      setCoBrandingLookup(place.id, { ...best, fetchedAt: result.fetchedAt });
      updateCoBrandingContact(place.id, {
        ...(best.business.phone   ? { contactPhone: best.business.phone } : {}),
        ...(best.business.email   ? { contactEmail: best.business.email } : {}),
        ...(best.business.website ? { website: best.business.website } : {}),
      });
      if (result.warnings.length) setError(result.warnings.join(' '));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [place, ensureCoBranding, setCoBrandingLookup, updateCoBrandingContact]);

  const inquiry = place ? buildVerificationInquiry({ place, appSettings, kind }) : null;

  const sendEmail = useCallback(async () => {
    try {
      await Linking.openURL(buildMailtoUrl({ to: email || '', subject: inquiry.subject, body: inquiry.body }));
      logOutreach(place.id, { channel: 'email', templateKey: `verify_${kind}`, subject: inquiry.subject, note: 'Verification inquiry' });
    } catch (err) {
      showAlert('No mail app', 'Could not open a mail app. Use Share instead.');
    }
  }, [email, inquiry, logOutreach, place, kind]);

  const share = useCallback(async () => {
    try {
      const r = await Share.share({ title: inquiry.subject, subject: inquiry.subject, message: `${inquiry.subject}\n\n${inquiry.body}` });
      if (r.action !== Share.dismissedAction) logOutreach(place.id, { channel: 'share', templateKey: `verify_${kind}`, subject: inquiry.subject, note: 'Verification inquiry' });
    } catch (err) {
      showAlert('Could not share', err.message);
    }
  }, [inquiry, logOutreach, place, kind]);

  const copy = async (value) => { try { await Clipboard.setStringAsync(value); showAlert('Copied', value); } catch (err) { showAlert(value); } };

  if (!place) return null;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.head}>
        <Text style={styles.title}>Business contact</Text>
        <Pressable onPress={run} disabled={busy} accessibilityRole="button" style={styles.lookupButton}>
          <Ionicons name="search-outline" size={14} color={colors.primary} />
          <Text style={styles.lookupText}>{busy ? 'Looking up…' : lookup ? 'Look up again' : 'Look up on OpenStreetMap'}</Text>
        </Pressable>
      </View>

      {lookup ? (
        <Text style={styles.caption}>
          OSM: {lookup.name || lookup.displayName}{lookup.category ? ` · ${lookup.category}/${lookup.type}` : ''}
          {lookup.business?.toilets ? ` · toilets tag: ${lookup.business.toilets}` : ''}
        </Text>
      ) : !busy && !error ? (
        <Text style={styles.caption}>Find the business's phone or email to confirm this submission before you decide.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.rows}>
        <Row label="Phone"   value={phone}   onOpen={phone ? () => Linking.openURL(buildTelUrl(phone)).catch(() => {}) : null} onCopy={phone ? () => copy(phone) : null} />
        <Row label="Email"   value={email}   onOpen={email ? sendEmail : null} onCopy={email ? () => copy(email) : null} openIcon="mail-outline" />
        <Row label="Website" value={website} onOpen={website ? () => Linking.openURL(normalizeWebsite(website)).catch(() => {}) : null} onCopy={website ? () => copy(website) : null} openIcon="open-outline" />
      </View>

      <View style={styles.templateRow}>
        <View style={styles.templateText}>
          <Text style={styles.templateTitle}>Inquiry template</Text>
          <Text style={styles.caption} numberOfLines={2}>{inquiry.subject}</Text>
        </View>
        <Chip label={email ? 'Email' : 'Email (no address)'} trailingIcon="mail-outline" onPress={sendEmail} />
        <Chip label="Share" trailingIcon="share-outline" onPress={share} />
      </View>
    </View>
  );
}

function Row({ label, value, onOpen, onCopy, openIcon = 'call-outline' }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, !value && styles.rowMissing]} numberOfLines={1}>{value || 'Not listed on OpenStreetMap'}</Text>
      {onOpen ? <Pressable onPress={onOpen} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Open ${label}`}><Ionicons name={openIcon} size={18} color={colors.primary} /></Pressable> : null}
      {onCopy ? <Pressable onPress={onCopy} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Copy ${label}`}><Ionicons name="copy-outline" size={18} color={colors.textSecondary} /></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.adminBorder, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { ...typography.adminSectionHeader },
  lookupButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  lookupText: { ...typography.captionMedium, color: colors.primary },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: colors.modFlaggedText },
  rows: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { ...typography.label, width: 56 },
  rowValue: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  rowMissing: { fontStyle: 'italic', color: colors.textSecondary },
  templateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: spacing.sm },
  templateText: { flex: 1, minWidth: 120 },
  templateTitle: { ...typography.captionMedium, color: colors.textPrimary },
});

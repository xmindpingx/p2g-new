// places2go — PresenceEvidenceCard (admin)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Shows the recorded location facts behind a submission: result level and the
// rules that produced it, the zone timeline (at restroom spot / on premises /
// nearby / away) with time in each, arrival and departure, GPS accuracy, and
// the raw downsampled samples. Every figure is what the device recorded; the
// card says so where accuracy limits what can be concluded.

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius } from '../theme';
import { PRESENCE_LEVEL, PRESENCE_LEVEL_LABELS, ZONE, ZONE_LABELS, ZONE_ORDER, RISK_FLAG_LABELS } from '../services/presence';

const LEVEL_STYLE = {
  [PRESENCE_LEVEL.STRONG]:      { bg: colors.modCleanBg,    text: colors.modCleanText },
  [PRESENCE_LEVEL.MODERATE]:    { bg: colors.modPendingBg,  text: colors.modPendingText },
  [PRESENCE_LEVEL.WEAK]:        { bg: colors.modFlaggedBg,  text: colors.modFlaggedText },
  [PRESENCE_LEVEL.FAILED]:      { bg: colors.modRejectedBg, text: colors.modRejectedText },
  [PRESENCE_LEVEL.UNAVAILABLE]: { bg: colors.modPendingBg,  text: colors.modPendingText },
};

const ZONE_COLOR = {
  [ZONE.RESTROOM]: colors.success,
  [ZONE.PREMISES]: colors.accent,
  [ZONE.NEARBY]:   colors.textSecondary,
  [ZONE.AWAY]:     colors.border,
};

const fmtTime = (ms) => {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
};

const fmtSeconds = (s) => {
  if (!Number.isFinite(s)) return '—';
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m} min ${r} s` : `${m} min`;
};

function Fact({ label, value }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export default function PresenceEvidenceCard({ evidence, riskFlags = [], presenceDistanceAtSubmitM = null, style }) {
  const [showSamples, setShowSamples] = useState(false);

  if (!evidence) {
    return (
      <View style={[styles.card, style]}>
        <Text style={styles.title}>Presence evidence</Text>
        <Text style={styles.caption}>No location evidence was recorded for this submission (presence check was off, or the app had no location access).</Text>
        {riskFlags.length ? <Text style={styles.flags}>{riskFlags.map((f) => RISK_FLAG_LABELS[f] || f).join(' · ')}</Text> : null}
      </View>
    );
  }

  const lvl = LEVEL_STYLE[evidence.level] || LEVEL_STYLE[PRESENCE_LEVEL.UNAVAILABLE];
  const tl  = evidence.timeline;
  const totalTracked = tl ? ZONE_ORDER.reduce((t, z) => t + (tl.totalsSeconds[z] || 0), 0) : 0;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.head}>
        <Text style={styles.title}>Presence evidence</Text>
        <View style={[styles.pill, { backgroundColor: lvl.bg }]}>
          <Text style={[styles.pillText, { color: lvl.text }]}>{PRESENCE_LEVEL_LABELS[evidence.level] || evidence.level}</Text>
        </View>
      </View>

      {evidence.reasons?.map((r, i) => (
        <View key={i} style={styles.reasonRow}>
          <Ionicons name="ellipse" size={5} color={colors.textSecondary} />
          <Text style={styles.reason}>{r}</Text>
        </View>
      ))}

      {riskFlags.length ? (
        <View style={styles.flagsWrap}>
          {riskFlags.map((f) => (
            <View key={f} style={styles.flagChip}><Text style={styles.flagText}>{RISK_FLAG_LABELS[f] || f}</Text></View>
          ))}
        </View>
      ) : null}

      <View style={styles.facts}>
        <Fact label="Distance at submit" value={presenceDistanceAtSubmitM !== null ? `${presenceDistanceAtSubmitM} m` : evidence.distanceAtSubmitM !== null ? `${evidence.distanceAtSubmitM} m` : '—'} />
        <Fact label="Closest to pin"     value={evidence.minDistanceM !== null ? `${evidence.minDistanceM} m` : '—'} />
        <Fact label="GPS accuracy (median)" value={evidence.accuracyMedianM !== null ? `±${evidence.accuracyMedianM} m` : '—'} />
        <Fact label="Samples (usable / total)" value={`${evidence.usableSampleCount} / ${evidence.sampleCount}`} />
        <Fact label="Mock location" value={evidence.mockedDetected ? 'Reported by device' : 'Not reported'} />
        <Fact label="Approach / departure" value={`${evidence.approachDetected ? 'Yes' : 'No'} / ${evidence.departureDetected ? 'Yes' : 'No'}`} />
      </View>

      {tl ? (
        <>
          <Text style={styles.subTitle}>Visit timeline</Text>
          {totalTracked > 0 ? (
            <View style={styles.bar}>
              {tl.segments.filter((s) => s.seconds > 0).map((s, i) => (
                <View key={i} style={[styles.barSeg, { flex: s.seconds, backgroundColor: ZONE_COLOR[s.zone] }]} />
              ))}
            </View>
          ) : (
            <Text style={styles.caption}>Only one sample was recorded, so no time spans can be measured.</Text>
          )}
          <View style={styles.legend}>
            {ZONE_ORDER.map((z) => (
              <View key={z} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: ZONE_COLOR[z] }]} />
                <Text style={styles.legendText}>{ZONE_LABELS[z]}: {fmtSeconds(tl.totalsSeconds[z] || 0)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.facts}>
            <Fact label="Arrived on premises" value={fmtTime(tl.arrivedAt)} />
            <Fact label="Left premises"       value={tl.departedAt ? fmtTime(tl.departedAt) : 'Not recorded'} />
            <Fact label="At restroom spot from" value={tl.restroomEnteredAt ? fmtTime(tl.restroomEnteredAt) : tl.restroomFixUsed ? 'Never within zone' : 'No spot marked'} />
            <Fact label="At restroom spot until" value={tl.restroomLeftAt ? fmtTime(tl.restroomLeftAt) : '—'} />
          </View>
          {evidence.restroomFix ? (
            <Text style={styles.caption}>
              Restroom spot marked by the contributor {evidence.restroomFix.distanceFromPinM} m from the pin
              {evidence.restroomFix.accuracy !== null ? ` (GPS ±${evidence.restroomFix.accuracy} m at that moment)` : ''}.
              Indoor GPS is typically accurate to tens of metres, so treat the "at restroom" zone as approximate when the accuracy figure is larger than the {evidence.settingsUsed?.inner ?? '—'} m zone radius.
            </Text>
          ) : (
            <Text style={styles.caption}>
              No restroom spot was marked, so the inner zone is measured from the pin itself.
            </Text>
          )}

          <Pressable onPress={() => setShowSamples((v) => !v)} style={styles.toggle} accessibilityRole="button">
            <Text style={styles.toggleText}>{showSamples ? 'Hide' : 'Show'} recorded samples ({tl.points.length})</Text>
            <Ionicons name={showSamples ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
          </Pressable>
          {showSamples ? (
            <View style={styles.samples}>
              <View style={styles.sampleHead}>
                <Text style={[styles.sampleCell, styles.sampleHeadText]}>Time</Text>
                <Text style={[styles.sampleCell, styles.sampleHeadText]}>To pin</Text>
                <Text style={[styles.sampleCell, styles.sampleHeadText]}>To restroom</Text>
                <Text style={[styles.sampleCell, styles.sampleHeadText]}>±Acc</Text>
                <Text style={[styles.sampleCell, styles.sampleHeadText]}>Zone</Text>
              </View>
              {tl.points.map((p, i) => (
                <View key={i} style={styles.sampleRow}>
                  <Text style={styles.sampleCell}>{fmtTime(p.at)}</Text>
                  <Text style={styles.sampleCell}>{p.dPin} m</Text>
                  <Text style={styles.sampleCell}>{p.dRestroom !== null ? `${p.dRestroom} m` : '—'}</Text>
                  <Text style={styles.sampleCell}>{p.acc !== null ? `${p.acc} m` : '—'}</Text>
                  <Text style={[styles.sampleCell, { color: ZONE_COLOR[p.zone] === colors.border ? colors.textSecondary : ZONE_COLOR[p.zone] }]}>{ZONE_LABELS[p.zone]}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.adminBorder, padding: spacing.lg, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.adminSectionHeader },
  subTitle: { ...typography.adminSectionHeader, marginTop: spacing.sm },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pillText: { ...typography.badge },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingLeft: 2 },
  reason: { ...typography.caption, flex: 1, color: colors.textPrimary },
  flagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  flagChip: { backgroundColor: colors.modFlaggedBg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  flagText: { ...typography.badge, color: colors.modFlaggedText },
  flags: { ...typography.caption, color: colors.modFlaggedText },
  facts: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  fact: { width: '50%', paddingVertical: spacing.xs, paddingRight: spacing.sm },
  factLabel: { ...typography.label },
  factValue: { ...typography.captionMedium, color: colors.textPrimary },
  caption: { ...typography.caption },
  bar: { flexDirection: 'row', height: 10, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.border },
  barSeg: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, width: '48%' },
  legendDot: { width: 8, height: 8, borderRadius: radius.pill },
  legendText: { ...typography.caption, color: colors.textPrimary },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  toggleText: { ...typography.captionMedium, color: colors.primary },
  samples: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, marginTop: spacing.xs },
  sampleHead: { flexDirection: 'row', paddingVertical: spacing.xs },
  sampleHeadText: { ...typography.label },
  sampleRow: { flexDirection: 'row', paddingVertical: 2 },
  sampleCell: { ...typography.caption, flex: 1, fontSize: 11 },
});

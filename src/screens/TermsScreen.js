// places2go — TermsScreen
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// First launch (and after any terms update): the user must read and accept the
// Terms of Service, Privacy Policy, Contributor Terms and Community Guidelines
// before using the app. This is the one intro step without a Skip button.
//
// route.params.readOnly = true shows the same documents from Profile without
// the acceptance controls.

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius } from '../theme';
import useStore from '../store/useStore';
import { ROUTES } from '../navigation/routes';
import { getNextIntroRoute } from '../navigation/introFlow';
import {
  LEGAL_VERSION, LEGAL_DOC_ORDER, LEGAL_DOC_LABELS, LEGAL_DOCS,
  renderLegalDoc, buildOwnershipNotice,
} from '../constants/legal';
import PrimaryButton from '../components/PrimaryButton';

export default function TermsScreen({ navigation, route }) {
  const insets   = useSafeAreaInsets();
  const readOnly = route.params?.readOnly === true;
  const initial  = route.params?.doc && LEGAL_DOC_LABELS[route.params.doc] ? route.params.doc : LEGAL_DOCS.TERMS;

  const appSettings            = useStore((s) => s.appSettings);
  const legalAcceptance        = useStore((s) => s.legalAcceptance);
  const hasCompletedOnboarding = useStore((s) => s.hasCompletedOnboarding);
  const currentUser            = useStore((s) => s.currentUser);
  const acceptLegal            = useStore((s) => s.acceptLegal);

  const [docKey, setDocKey]   = useState(initial);
  const [agreed, setAgreed]   = useState(false);
  const [ageOk, setAgeOk]     = useState(false);

  const doc = useMemo(() => renderLegalDoc(docKey, appSettings), [docKey, appSettings]);
  const isUpdate = !readOnly && legalAcceptance && legalAcceptance.version !== LEGAL_VERSION;
  const minimumAge = appSettings.legalMinimumAge;

  const accept = () => {
    acceptLegal(LEGAL_VERSION);
    const next = getNextIntroRoute({
      legalAcceptance: { version: LEGAL_VERSION },
      hasCompletedOnboarding,
      currentUser,
    });
    navigation.replace(next);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {readOnly ? (
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <View style={styles.headerText}>
          <Text style={styles.title}>{readOnly ? 'Terms & Privacy' : isUpdate ? 'Our terms have been updated' : 'Before you start'}</Text>
          <Text style={styles.caption}>
            {readOnly
              ? `Version ${LEGAL_VERSION}${legalAcceptance ? ` · accepted ${new Date(legalAcceptance.acceptedAt).toLocaleDateString()}` : ''}`
              : 'Please read these documents. Tap each tab to view it.'}
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsWrap}>
        {LEGAL_DOC_ORDER.map((key) => (
          <Pressable
            key={key}
            onPress={() => setDocKey(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: docKey === key }}
            style={[styles.tab, docKey === key && styles.tabActive]}
          >
            <Text style={[styles.tabText, docKey === key && styles.tabTextActive]}>{LEGAL_DOC_LABELS[key]}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={styles.doc} contentContainerStyle={[styles.docContent, { paddingBottom: insets.bottom + (readOnly ? spacing.xl : 220) }]}>
        <Text style={styles.docTitle}>{doc.title}</Text>
        <Text style={styles.docIntro}>{doc.intro}</Text>
        {doc.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((p, i) => (
              <Text key={i} style={styles.paragraph}>{p}</Text>
            ))}
          </View>
        ))}
        <Text style={styles.ownership}>{buildOwnershipNotice(appSettings)}</Text>
      </ScrollView>

      {!readOnly ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Pressable onPress={() => setAgeOk((v) => !v)} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: ageOk }}>
            <Ionicons name={ageOk ? 'checkbox' : 'square-outline'} size={22} color={ageOk ? colors.primary : colors.textSecondary} />
            <Text style={styles.checkText}>I am at least {minimumAge} years old.</Text>
          </Pressable>
          <Pressable onPress={() => setAgreed((v) => !v)} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
            <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={22} color={agreed ? colors.primary : colors.textSecondary} />
            <Text style={styles.checkText}>
              I have read and agree to the Terms of Service, Contributor Terms and Community Guidelines, and I have read the Privacy Policy.
            </Text>
          </Pressable>
          <PrimaryButton label="Agree & continue" onPress={accept} disabled={!agreed || !ageOk} />
          <Text style={styles.footnote}>You can read these again any time from your Profile.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  headerText: { flex: 1 },
  title: { ...typography.heading },
  caption: { ...typography.caption, marginTop: 2 },
  tabsWrap: { flexGrow: 0 },
  tabs: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  tab: { height: 34, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.chipInactiveBg, borderWidth: 1, borderColor: colors.chipInactiveBorder, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.chipActiveBg, borderColor: colors.chipActiveBg },
  tabText: { ...typography.captionMedium, color: colors.chipInactiveText },
  tabTextActive: { color: colors.chipActiveText },
  doc: { flex: 1 },
  docContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  docTitle: { ...typography.subheading },
  docIntro: { ...typography.caption, marginTop: spacing.xs, marginBottom: spacing.md },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.bodyMedium, marginBottom: spacing.xs },
  paragraph: { ...typography.body, fontSize: 14, lineHeight: 21, marginBottom: spacing.sm },
  ownership: { ...typography.label, textAlign: 'center', marginTop: spacing.lg },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: spacing.sm },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs },
  checkText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  footnote: { ...typography.label, textAlign: 'center' },
});

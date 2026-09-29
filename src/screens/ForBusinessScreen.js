// places2go — ForBusinessScreen (wireframe #11)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// "A cleaner tomorrow starts here." Four checkmarked benefits and a
// "List My Business" button that opens the Add a Place form.

import React from 'react';
import { View, Text, ScrollView, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../theme';
import { ROUTES } from '../navigation/routes';
import PrimaryButton from '../components/PrimaryButton';

const BENEFITS = [
  'Show up on the map',
  'Build customer trust',
  'Highlight your commitment',
  "It's free to get started",
];

export default function ForBusinessScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
      <Image source={require('../../assets/photos/business-hero.jpg')} style={styles.hero} resizeMode="cover" accessibilityLabel="A clean, well-kept restroom" />
      <Text style={styles.title}>A cleaner tomorrow starts here.</Text>
      <Text style={styles.body}>
        Businesses that invest in great restrooms create better experiences for everyone.
      </Text>

      <View style={styles.list}>
        {BENEFITS.map((b) => (
          <View key={b} style={styles.item}>
            <View style={styles.check}><Ionicons name="checkmark" size={14} color={colors.textOnAccent} /></View>
            <Text style={styles.itemText}>{b}</Text>
          </View>
        ))}
      </View>

      <PrimaryButton label="List My Business" onPress={() => navigation.navigate(ROUTES.ADD_PLACE)} />
      <Text style={styles.footnote}>
        Listing adds your restroom to the map like any other place. Reviews come from the community.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  hero: { width: '100%', height: 160, borderRadius: radius.lg, backgroundColor: colors.surface, marginBottom: spacing.xl },
  title: { ...typography.title },
  body: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  list: { marginVertical: spacing.xl, gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  check: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  itemText: { ...typography.body },
  footnote: { ...typography.label, textAlign: 'center', marginTop: spacing.md },
});

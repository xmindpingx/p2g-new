// places2go — BiggerPictureScreen (wireframe #12)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Walnut full-bleed brand statement with live community totals from the store.

import React from 'react';
import { View, Text, Pressable, Image, ImageBackground, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, fontSizes, typography, spacing, radius } from '../theme';
import useStore from '../store/useStore';
import { ROUTES } from '../navigation/routes';
import PrimaryButton from '../components/PrimaryButton';

export default function BiggerPictureScreen({ navigation }) {
  const insets  = useSafeAreaInsets();
  const places  = useStore((s) => s.places.length);
  const reviews = useStore((s) => s.reviews.length);

  return (
    <ImageBackground source={require('../../assets/photos/bigger-picture.jpg')} style={styles.container} imageStyle={styles.backgroundImage} resizeMode="cover">
     <View style={[styles.overlay, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }]}>
      <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={24} color={colors.textOnDark} />
      </Pressable>

      <View style={styles.center}>
        <Image source={require('../../assets/brand/icon-256.png')} style={styles.tile} resizeMode="contain" accessibilityLabel="places2go" />
        <Text style={styles.wordmark}>places<Text style={styles.wordmarkAccent}>2</Text>go</Text>
        <Text style={styles.headline}>More confidence for wherever you're headed.</Text>
        <Text style={styles.body}>Because life goes better when you know.</Text>

        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statValue}>{places}</Text><Text style={styles.statLabel}>places on the map</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{reviews}</Text><Text style={styles.statLabel}>community reviews</Text></View>
        </View>
      </View>

      <PrimaryButton
        label="Add a place you know"
        onPress={() => navigation.navigate(ROUTES.ADD_PLACE)}
        textColor={colors.textOnAccent}
        style={styles.button}
      />
     </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceDark },
  backgroundImage: { opacity: 0.9 },
  // A walnut wash keeps the text legible over the photo
  overlay: { flex: 1, paddingHorizontal: spacing.lg, backgroundColor: 'rgba(75, 46, 30, 0.35)' },
  back: { alignSelf: 'flex-start', padding: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tile: { width: 84, height: 84, borderRadius: radius.lg, marginBottom: spacing.md },
  tileText: { fontFamily: fonts.bold, fontSize: 40, color: colors.textOnAccent, includeFontPadding: false },
  wordmark: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: colors.textOnDark },
  wordmarkAccent: { color: colors.accent },
  headline: { ...typography.title, color: colors.textOnDark, textAlign: 'center', marginTop: spacing.xl, textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  body: { ...typography.body, color: colors.textOnDark, opacity: 0.8, textAlign: 'center', marginTop: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xxl },
  stat: { alignItems: 'center' },
  statValue: { fontFamily: fonts.bold, fontSize: fontSizes.display, color: colors.accent },
  statLabel: { ...typography.label, color: colors.textOnDark, opacity: 0.8 },
  button: { backgroundColor: colors.accent },
});

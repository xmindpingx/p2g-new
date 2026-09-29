// places2go — SplashScreen (wireframe #1)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Walnut full-bleed, gold "2" tile, wordmark, tagline. Holds briefly, then
// routes to the next intro step (Terms → Onboarding → Sign-in → Map).
// A small "Skip" at the top centre jumps straight to the map once the Terms
// have been accepted; before that, the Terms are the one step that cannot be
// skipped, so the button is not shown.

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, fontSizes, spacing, radius } from '../theme';
import useStore from '../store/useStore';
import { getNextIntroRoute, getSkipRoute } from '../navigation/introFlow';
import { needsLegalAcceptance } from '../constants/legal';
import SkipIntroButton from '../components/SkipIntroButton';
import OwnershipFooter from '../components/OwnershipFooter';

const HOLD_MS = 1200;

export default function SplashScreen({ navigation }) {
  const legalAcceptance        = useStore((s) => s.legalAcceptance);
  const hasCompletedOnboarding = useStore((s) => s.hasCompletedOnboarding);
  const currentUser            = useStore((s) => s.currentUser);
  const skipIntro              = useStore((s) => s.skipIntro);

  const nextRoute = getNextIntroRoute({ legalAcceptance, hasCompletedOnboarding, currentUser });
  const canSkip   = !needsLegalAcceptance(legalAcceptance);

  useEffect(() => {
    const timer = setTimeout(() => navigation.replace(nextRoute), HOLD_MS);
    return () => clearTimeout(timer);
  }, [navigation, nextRoute]);

  const handleSkip = () => {
    skipIntro();
    navigation.replace(getSkipRoute({ legalAcceptance }));
  };

  return (
    <View style={styles.container}>
      {canSkip ? <SkipIntroButton onPress={handleSkip} light /> : null}
      <View style={styles.tile}>
        <Text style={styles.tileText}>2</Text>
      </View>
      <Text style={styles.wordmark}>
        places<Text style={styles.wordmarkAccent}>2</Text>go
      </Text>
      <Text style={styles.tagline}>Your business is our business.</Text>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Find. Go. Feel good.</Text>
        <OwnershipFooter light style={styles.ownership} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.surfaceDark,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         spacing.xl,
  },
  tile: {
    width:           84,
    height:          84,
    borderRadius:    radius.lg,
    backgroundColor: colors.accent,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    spacing.lg,
  },
  tileText: {
    fontFamily: fonts.bold,
    fontSize:   48,
    color:      colors.textOnAccent,
    includeFontPadding: false,
  },
  wordmark: {
    fontFamily: fonts.bold,
    fontSize:   fontSizes.xxl,
    color:      colors.textOnDark,
  },
  wordmarkAccent: {
    color: colors.accent,
  },
  tagline: {
    fontFamily: fonts.regular,
    fontSize:   fontSizes.sm,
    color:      colors.textOnDark,
    marginTop:  spacing.sm,
  },
  footer: {
    position:   'absolute',
    bottom:     spacing.xxl,
    left:       0,
    right:      0,
    alignItems: 'center',
  },
  footerText: {
    fontFamily: fonts.regular,
    fontSize:   fontSizes.sm,
    color:      colors.textOnDark,
    opacity:    0.7,
  },
  ownership: {
    marginTop: spacing.md,
  },
});

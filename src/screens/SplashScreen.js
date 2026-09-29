// places2go — SplashScreen (wireframe #1)
// Walnut full-bleed, gold "2" tile, wordmark, tagline. Holds briefly, then
// routes to Onboarding or MainTabs based on route.params.nextRoute.

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, fontSizes, spacing, radius } from '../theme';
import { ROUTES } from '../navigation/routes';

const HOLD_MS = 1200;

export default function SplashScreen({ navigation, route }) {
  const nextRoute = route.params?.nextRoute || ROUTES.ONBOARDING;

  useEffect(() => {
    const timer = setTimeout(() => navigation.replace(nextRoute), HOLD_MS);
    return () => clearTimeout(timer);
  }, [navigation, nextRoute]);

  return (
    <View style={styles.container}>
      <View style={styles.tile}>
        <Text style={styles.tileText}>2</Text>
      </View>
      <Text style={styles.wordmark}>
        places<Text style={styles.wordmarkAccent}>2</Text>go
      </Text>
      <Text style={styles.tagline}>Your business is our business.</Text>
      <Text style={styles.footer}>Find. Go. Feel good.</Text>
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
    bottom:     spacing.xxl * 2,
    fontFamily: fonts.regular,
    fontSize:   fontSizes.sm,
    color:      colors.textOnDark,
    opacity:    0.7,
  },
});

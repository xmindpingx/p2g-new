// places2go — OnboardingScreen (wireframe #2)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Three pages with dots, a small Skip at the top centre, and Get Started on
// the last page. Tap Next or swipe left/right to advance.
// Renders one page at a time (no FlatList) — reliable on web and native.

import React, { useRef, useState } from 'react';
import {
  View, Text, Animated, PanResponder,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../theme';
import useStore from '../store/useStore';
import useAppWindowDimensions from '../hooks/useAppWindowDimensions';
import { getRouteAfterOnboarding, getSkipRoute } from '../navigation/introFlow';
import PrimaryButton from '../components/PrimaryButton';
import SkipIntroButton from '../components/SkipIntroButton';

const PAGES = [
  {
    key:   'confidence',
    icon:  'compass-outline',
    title: 'Confidence in every direction.',
    body:  'Find clean, accessible, and reliable restrooms wherever life takes you.',
  },
  {
    key:   'community',
    icon:  'people-outline',
    title: 'Real places. Real people.',
    body:  'Every pin is added and reviewed by people who were actually there.',
  },
  {
    key:   'contribute',
    icon:  'add-circle-outline',
    title: 'Know one? Add it.',
    body:  'Add a place and a proper review, and the app owner pays you for the contribution.',
  },
];

const SWIPE_THRESHOLD = 60;

export default function OnboardingScreen({ navigation }) {
  const insets  = useSafeAreaInsets();
  const { width } = useAppWindowDimensions();
  const [index, setIndex]   = useState(0);
  const fadeAnim            = useRef(new Animated.Value(1)).current;
  const completeOnboarding  = useStore((s) => s.completeOnboarding);
  const skipIntro           = useStore((s) => s.skipIntro);
  const legalAcceptance     = useStore((s) => s.legalAcceptance);
  const currentUser         = useStore((s) => s.currentUser);

  const goTo = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= PAGES.length) return;
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
    setIndex(nextIndex);
  };

  const finish = () => {
    completeOnboarding();
    navigation.replace(getRouteAfterOnboarding({ legalAcceptance, currentUser }));
  };

  const skip = () => {
    skipIntro();
    navigation.replace(getSkipRoute({ legalAcceptance }));
  };

  const next = () => {
    if (index >= PAGES.length - 1) { finish(); return; }
    goTo(index + 1);
  };

  // Swipe left → next, swipe right → previous
  const swipeStart = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dy) < 40,
      onPanResponderGrant: (_, g) => { swipeStart.current = g.x0; },
      onPanResponderRelease: (_, g) => {
        const dx = g.moveX - swipeStart.current;
        if (dx < -SWIPE_THRESHOLD) goTo(index + 1);
        else if (dx > SWIPE_THRESHOLD) goTo(index - 1);
      },
    }),
  ).current;

  const page = PAGES[index];
  const isLast = index === PAGES.length - 1;

  return (
    <View
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]}
      {...panResponder.panHandlers}
    >
      <SkipIntroButton onPress={skip} />
      <View style={styles.topSpacer} />

      {/* Single page — cross-platform, no FlatList paging quirks */}
      <Animated.View style={[styles.page, { width, opacity: fadeAnim }]}>
        <View style={styles.iconWrap}>
          <Ionicons name={page.icon} size={44} color={colors.primary} />
        </View>
        <Text style={styles.title}>{page.title}</Text>
        <Text style={styles.body}>{page.body}</Text>
      </Animated.View>

      <View style={styles.dots}>
        {PAGES.map((p, i) => (
          <View key={p.key} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <PrimaryButton
        label={isLast ? 'Get Started' : 'Next'}
        onPress={next}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.background,
    alignItems:      'center',
  },
  topSpacer: {
    height: 44,
  },
  page: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: spacing.xxl,
  },
  iconWrap: {
    width:           96,
    height:          96,
    borderRadius:    radius.pill,
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    spacing.xl,
  },
  title: {
    ...typography.title,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color:     colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  dots: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            spacing.sm,
    marginBottom:   spacing.xl,
  },
  dot: {
    width:           8,
    height:          8,
    borderRadius:    radius.pill,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
  },
  button: {
    marginHorizontal: spacing.lg,
    width:            '100%',
    maxWidth:         400,
  },
});

// places2go — OnboardingScreen (wireframe #2)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Three swipeable pages with dots, a small Skip at the top centre, and Get
// Started on the last page. Both continue to Sign-in (or straight to the map
// when the user is already signed in).

import React, { useRef, useState } from 'react';
import { View, Text, FlatList, useWindowDimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../theme';
import useStore from '../store/useStore';
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

export default function OnboardingScreen({ navigation }) {
  const insets  = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef(null);
  const [index, setIndex] = useState(0);
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const skipIntro          = useStore((s) => s.skipIntro);
  const legalAcceptance    = useStore((s) => s.legalAcceptance);
  const currentUser        = useStore((s) => s.currentUser);

  const finish = () => {
    completeOnboarding();
    navigation.replace(getRouteAfterOnboarding({ legalAcceptance, currentUser }));
  };

  // Skip goes straight to the map (a signed-in user stays signed in).
  const skip = () => {
    skipIntro();
    navigation.replace(getSkipRoute({ legalAcceptance }));
  };

  const next = () => {
    if (index >= PAGES.length - 1) { finish(); return; }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  const isLast = index === PAGES.length - 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]}>
      <SkipIntroButton onPress={skip} />
      <View style={styles.topSpacer} />

      <FlatList
        ref={listRef}
        data={PAGES}
        keyExtractor={(p) => p.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={[styles.page, { width }]}>
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={44} color={colors.primary} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {PAGES.map((p, i) => (
          <View key={p.key} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <PrimaryButton label={isLast ? 'Get Started' : 'Next'} onPress={next} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.background,
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
  },
});

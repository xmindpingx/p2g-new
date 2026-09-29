// places2go — AuthScreen
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Sign in with Apple (iOS), Google, or continue as a guest. A small Skip at the
// top centre goes straight to the map without choosing anything. Whatever the
// user picks is remembered until they sign out, so skipping later never signs
// them out. Opened from Profile (route.params.fromProfile) it shows a back
// button instead of Skip.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';

import { colors, typography, spacing, radius } from '../theme';
import useStore from '../store/useStore';
import { ROUTES } from '../navigation/routes';
import { isAppleSignInAvailable, signInWithApple, isAppleCancel, useGoogleSignIn } from '../services/auth';
import SkipIntroButton from '../components/SkipIntroButton';
import PrimaryButton from '../components/PrimaryButton';
import OwnershipFooter from '../components/OwnershipFooter';

export default function AuthScreen({ navigation, route }) {
  const insets      = useSafeAreaInsets();
  const fromProfile = route.params?.fromProfile === true;

  const signIn          = useStore((s) => s.signIn);
  const continueAsGuest = useStore((s) => s.continueAsGuest);
  const skipIntro       = useStore((s) => s.skipIntro);

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy]                     = useState(null); // 'apple' | 'guest' | null
  const [error, setError]                   = useState(null);

  useEffect(() => { isAppleSignInAvailable().then(setAppleAvailable); }, []);

  const finish = useCallback(() => {
    if (fromProfile) navigation.goBack();
    else navigation.replace(ROUTES.MAIN_TABS);
  }, [fromProfile, navigation]);

  const google = useGoogleSignIn((profile) => { signIn(profile); finish(); });

  const handleApple = useCallback(async () => {
    setError(null);
    setBusy('apple');
    try {
      const profile = await signInWithApple();
      signIn({ provider: profile.provider, providerUserId: profile.providerUserId, email: profile.email, displayName: profile.displayName });
      finish();
    } catch (err) {
      if (!isAppleCancel(err)) setError(err.message || 'Apple sign-in failed');
    } finally {
      setBusy(null);
    }
  }, [signIn, finish]);

  const handleGuest = useCallback(() => {
    setBusy('guest');
    continueAsGuest();
    finish();
  }, [continueAsGuest, finish]);

  const handleSkip = useCallback(() => {
    skipIntro();
    navigation.replace(ROUTES.MAIN_TABS);
  }, [skipIntro, navigation]);

  const errorText = error || google.error;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]}>
      {fromProfile ? (
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={[styles.back, { top: insets.top + spacing.sm }]} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
      ) : (
        <SkipIntroButton onPress={handleSkip} />
      )}

      <View style={styles.hero}>
        <View style={styles.tile}><Text style={styles.tileText}>2</Text></View>
        <Text style={styles.title}>Sign in or create an account</Text>
        <Text style={styles.body}>
          An account lets us attribute your places and reviews to you and pay the credits you earn. You can also continue as a guest and sign in later.
        </Text>
      </View>

      <View style={styles.buttons}>
        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.md}
            style={styles.appleButton}
            onPress={handleApple}
          />
        ) : Platform.OS === 'ios' ? (
          <Text style={styles.hint}>Sign in with Apple is not available on this device.</Text>
        ) : null}

        <Pressable
          onPress={google.signIn}
          disabled={!google.available || !google.ready || google.busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.providerButton, (!google.available || !google.ready) && styles.providerDisabled, pressed && styles.pressed]}
        >
          {google.busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
              <Text style={styles.providerText}>Continue with Google</Text>
            </>
          )}
        </Pressable>
        {!google.available ? (
          <Text style={styles.hint}>Google sign-in needs OAuth client IDs in src/config/auth.js.</Text>
        ) : null}

        <PrimaryButton
          label="Continue as guest"
          variant="secondary"
          onPress={handleGuest}
          loading={busy === 'guest'}
          disabled={busy !== null}
        />

        {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footnote}>
          By continuing you agree to the Terms of Service and Privacy Policy you accepted.
        </Text>
        <OwnershipFooter />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  back: { position: 'absolute', left: spacing.md, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  tile: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  tileText: { ...typography.display, color: colors.textOnAccent, includeFontPadding: false },
  title: { ...typography.title, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  buttons: { gap: spacing.sm },
  appleButton: { height: 52, width: '100%' },
  providerButton: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  providerDisabled: { opacity: 0.5 },
  providerText: { ...typography.button, color: colors.textPrimary },
  pressed: { opacity: 0.85 },
  hint: { ...typography.label, textAlign: 'center' },
  error: { ...typography.caption, color: colors.modRejectedText, textAlign: 'center', marginTop: spacing.xs },
  footer: { marginTop: spacing.lg },
  footnote: { ...typography.label, textAlign: 'center' },
});

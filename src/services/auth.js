// places2go — Sign-in providers
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
//   Apple  — expo-apple-authentication (iOS only; needs `usesAppleSignIn` and
//            the plugin in app.json, and Sign in with Apple enabled on the
//            App ID in your Apple developer account).
//   Google — expo-auth-session's Google provider. Requires OAuth client IDs
//            created in Google Cloud Console → Credentials, entered in
//            src/config/auth.js. Note: Expo marks this provider deprecated in
//            favour of @react-native-google-signin/google-signin; it still
//            works with a development build. Swapping the implementation is a
//            change to this file only — screens use signInWithApple() and
//            useGoogleSignIn() and never touch the SDKs directly.
//   Guest  — no provider call; handled entirely by the store.
//
// No provider tokens are kept in the app. When you add a backend, send the
// identity token to it here, exchange it for your own session token, and
// keep that token in expo-secure-store — never in the persisted Zustand store.

import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

import { GOOGLE_AUTH, isGoogleConfigured } from '../config/auth';
import { AUTH_PROVIDERS } from '../store/useStore';

WebBrowser.maybeCompleteAuthSession();

// ---------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------
export async function isAppleSignInAvailable() {
  if (Platform.OS !== 'ios') return false;
  try { return await AppleAuthentication.isAvailableAsync(); } catch (err) { return false; }
}

/**
 * signInWithApple() → { provider, providerUserId, email, displayName }
 * Throws on failure. A user cancel throws with code 'ERR_REQUEST_CANCELED'.
 * Apple only returns name and email on the FIRST authorization for this app;
 * later sign-ins return null for both, which the store handles by keeping
 * what it already has.
 */
export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  const name = credential.fullName
    ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ')
    : '';
  return {
    provider:       AUTH_PROVIDERS.APPLE,
    providerUserId: credential.user,
    email:          credential.email || null,
    displayName:    name || null,
    // identityToken is returned to the caller only so a backend can verify it;
    // it is not stored anywhere by the app.
    identityToken:  credential.identityToken || null,
  };
}

export const isAppleCancel = (err) => err?.code === 'ERR_REQUEST_CANCELED';

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * useGoogleSignIn() → { available, ready, busy, error, signIn }
 *   available — client IDs are configured
 *   ready     — the auth request has loaded (button may be pressed)
 *   signIn()  — opens the Google consent flow; resolves to the identity
 *               profile via onSuccess, or reports an error via `error`.
 * The consent result arrives asynchronously, so the caller passes an
 * onSuccess callback that receives { provider, providerUserId, email, displayName }.
 */
export function useGoogleSignIn(onSuccess) {
  const available = isGoogleConfigured();
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId:     GOOGLE_AUTH.iosClientId     || undefined,
    androidClientId: GOOGLE_AUTH.androidClientId || undefined,
    webClientId:     GOOGLE_AUTH.webClientId     || undefined,
    scopes:          ['openid', 'profile', 'email'],
  });
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const handle = async () => {
      if (!response) return;
      if (response.type === 'error') {
        setError(response.error?.message || 'Google sign-in failed');
        setBusy(false);
        return;
      }
      if (response.type !== 'success') { setBusy(false); return; }
      const accessToken = response.authentication?.accessToken;
      if (!accessToken) { setError('Google did not return an access token'); setBusy(false); return; }
      try {
        const res  = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!res.ok) throw new Error(`Google userinfo responded with status ${res.status}`);
        const info = await res.json();
        if (cancelled) return;
        onSuccess?.({
          provider:       AUTH_PROVIDERS.GOOGLE,
          providerUserId: info.sub,
          email:          info.email || null,
          displayName:    info.name || null,
        });
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    handle();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const signIn = useCallback(async () => {
    if (!available) { setError('Google sign-in is not configured (src/config/auth.js)'); return; }
    if (!request)   { setError('Google sign-in is still loading'); return; }
    setError(null);
    setBusy(true);
    try {
      await promptAsync();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }, [available, request, promptAsync]);

  return { available, ready: !!request, busy, error, signIn };
}

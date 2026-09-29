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
import * as AppleAuthentication from '../native/appleAuth';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

import { GOOGLE_AUTH } from '../config/auth';
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

/** The client ID for the platform this build is running on ('' when not set). */
export function getPlatformGoogleClientId() {
  return Platform.select({
    ios:     GOOGLE_AUTH.iosClientId,
    android: GOOGLE_AUTH.androidClientId,
    default: GOOGLE_AUTH.webClientId,
  }) || '';
}

const NOT_CONFIGURED_MESSAGE = 'Google sign-in is not configured for this platform (src/config/auth.js)';

/**
 * useGoogleSignIn(onSuccess) → { available, ready, busy, error, signIn }
 *   available — a client ID is configured for this platform
 *   ready     — the auth request has loaded (button may be pressed)
 *   signIn()  — opens the Google consent flow; the identity profile
 *               { provider, providerUserId, email, displayName } arrives via onSuccess.
 *
 * expo-auth-session's Google.useAuthRequest throws during render when the
 * client ID for the current platform is undefined, which crashed the sign-in
 * screen on every platform until IDs were entered. The client ID comes from a
 * constant config file, so it is the same on every render of the app: the
 * branch below never changes between renders and hook order stays stable.
 */
export function useGoogleSignIn(onSuccess) {
  const clientId = getPlatformGoogleClientId();
  if (!clientId) return useUnconfiguredGoogleSignIn();          // eslint-disable-line react-hooks/rules-of-hooks
  return useConfiguredGoogleSignIn(clientId, onSuccess);          // eslint-disable-line react-hooks/rules-of-hooks
}

function useUnconfiguredGoogleSignIn() {
  const [error, setError] = useState(null);
  const signIn = useCallback(async () => { setError(NOT_CONFIGURED_MESSAGE); }, []);
  return { available: false, ready: false, busy: false, error, signIn };
}

function useConfiguredGoogleSignIn(clientId, onSuccess) {
  const available = true;
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId,
    scopes: ['openid', 'profile', 'email'],
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

// places2go — Sign-in provider configuration
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Google: create OAuth 2.0 client IDs in Google Cloud Console → APIs & Services
// → Credentials. You need an iOS client (bundle id com.places2go.app unless you
// changed app.json) and an Android client (package + SHA-1 of your signing
// key). The web client ID is used for the Expo Go / web flows. Leave a value
// empty and that platform's Google button shows as "not configured".
//
// Apple needs no IDs here: enable "Sign in with Apple" on the App ID in your
// Apple developer account; app.json already declares usesAppleSignIn.

export const GOOGLE_AUTH = {
  iosClientId:     '',
  androidClientId: '',
  webClientId:     '',
};

export const isGoogleConfigured = () =>
  Boolean(GOOGLE_AUTH.iosClientId || GOOGLE_AUTH.androidClientId || GOOGLE_AUTH.webClientId);

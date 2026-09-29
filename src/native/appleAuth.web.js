// places2go — Apple Sign In platform wrapper (web)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// expo-apple-authentication is native-only. isAvailableAsync() resolves false
// so AuthScreen never renders the Apple button on the web.
export const AppleAuthenticationScope = Object.freeze({ FULL_NAME: 0, EMAIL: 1 });
export const AppleAuthenticationButtonType  = Object.freeze({ SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 });
export const AppleAuthenticationButtonStyle = Object.freeze({ WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 });

export async function isAvailableAsync() { return false; }

export async function signInAsync() {
  throw new Error('Sign in with Apple is not available on the web.');
}

// Never rendered on the web (isAvailableAsync is false), kept for API parity.
export function AppleAuthenticationButton() { return null; }

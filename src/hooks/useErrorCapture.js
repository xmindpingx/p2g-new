// places2go — Global JS error capture hook
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Call useErrorCapture() once at the App root. It:
//   • Registers a global ErrorUtils handler (React Native's unhandled-error hook)
//   • Registers a window.onerror handler on web
//   • Keeps a ring buffer of the last MAX_ERRORS errors
//   • Exposes getQueuedErrors() / clearQueuedErrors() for the bug-report service
//
// ErrorUtils on RN: https://reactnative.dev/docs/javascript-environment

import { useEffect } from 'react';
import { Platform } from 'react-native';

const MAX_ERRORS = 20;

/** Ring buffer — module-level so it survives re-renders. */
const _errorQueue = [];

const _record = (message, source, lineno, colno, stack) => {
  _errorQueue.push({
    timestamp: new Date().toISOString(),
    message:   String(message || '').slice(0, 500),
    source:    String(source  || '').slice(0, 200),
    lineno:    lineno || null,
    colno:     colno  || null,
    stack:     String(stack   || '').slice(0, 1000),
  });
  if (_errorQueue.length > MAX_ERRORS) _errorQueue.shift();
};

/** Returns a copy of all queued errors. */
export const getQueuedErrors = () => [..._errorQueue];

/** Clears the ring buffer (call after the bug report is submitted). */
export const clearQueuedErrors = () => { _errorQueue.length = 0; };

/** Hook — register once at the root component. */
export default function useErrorCapture() {
  useEffect(() => {
    // ── React Native: ErrorUtils ──
    if (Platform.OS !== 'web' && typeof global?.ErrorUtils?.setGlobalHandler === 'function') {
      const prev = global.ErrorUtils.getGlobalHandler?.() || null;
      global.ErrorUtils.setGlobalHandler((error, isFatal) => {
        _record(
          error?.message || String(error),
          null,
          null,
          null,
          error?.stack || null,
        );
        if (prev) prev(error, isFatal);
      });
      return () => {
        if (prev && typeof global?.ErrorUtils?.setGlobalHandler === 'function') {
          global.ErrorUtils.setGlobalHandler(prev);
        }
      };
    }

    // ── Web: 'error' + 'unhandledrejection' events ──
    // addEventListener('error') delivers a single ErrorEvent — not the
    // (message, source, lineno, colno, error) tuple that window.onerror gets.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onError = (event) => {
        _record(
          event?.message || event?.error?.message || String(event?.error || event),
          event?.filename || null,
          event?.lineno   || null,
          event?.colno    || null,
          event?.error?.stack || null,
        );
      };
      const onUnhandled = (event) => {
        const err = event.reason;
        _record(
          err?.message || String(err),
          null, null, null,
          err?.stack || null,
        );
      };
      window.addEventListener('error',             onError);
      window.addEventListener('unhandledrejection', onUnhandled);
      return () => {
        window.removeEventListener('error',             onError);
        window.removeEventListener('unhandledrejection', onUnhandled);
      };
    }
  }, []);
}

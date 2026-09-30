// places2go — BugReportButton (floating, accessible from all screens)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// A small floating icon button fixed to the bottom-right corner. On tap it
// captures a screenshot, collects queued JS errors, and POSTs to the
// configured bug-report server. It shows inline feedback (submitting / done /
// error) without a modal so it never blocks the screen.
//
// Mount it inside the root navigator's screen wrapper (App.js) so it appears
// on every screen. It is always visible; the admin can hide it by clearing
// appSettings.bugReportUrl.

import React, { useRef, useState } from 'react';
import { Pressable, View, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius, shadows, layout } from '../theme';
import useStore from '../store/useStore';
import { captureAndSubmit } from '../services/bugReport';

const STATE = {
  IDLE:       'idle',
  SUBMITTING: 'submitting',
  SUCCESS:    'success',
  ERROR:      'error',
};

export default function BugReportButton() {
  const appSettings  = useStore((s) => s.appSettings);
  const currentUser  = useStore((s) => s.currentUser);
  const addBugReport = useStore((s) => s.addBugReport);

  const [state,   setState]   = useState(STATE.IDLE);
  const [message, setMessage] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Hidden when no server URL is configured
  if (!appSettings?.bugReportUrl?.trim()) return null;

  const showToast = (text, duration = 3000) => {
    setMessage(text);
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(duration),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setState(STATE.IDLE));
  };

  const handlePress = async () => {
    if (state === STATE.SUBMITTING) return;
    setState(STATE.SUBMITTING);

    try {
      const result = await captureAndSubmit({ appSettings, currentUser });
      // Cache locally so the admin sees it immediately on this device; the
      // Bug Reports screen refreshes the full list from the server.
      addBugReport({
        serverId:       result.id,
        submittedAt:    result.submittedAt,
        screenshotFile: result.screenshotFile,
        data:           result.payload,
      });
      setState(STATE.SUCCESS);
      showToast('Bug report sent. Thank you!');
    } catch (err) {
      setState(STATE.ERROR);
      showToast(err.message || 'Could not send the report.', 4000);
    }
  };

  const iconName =
    state === STATE.SUBMITTING ? 'sync-outline' :
    state === STATE.SUCCESS    ? 'checkmark-circle-outline' :
    state === STATE.ERROR      ? 'alert-circle-outline' :
    'bug-outline';

  const iconColor =
    state === STATE.SUCCESS ? colors.connVerifiedDot :
    state === STATE.ERROR   ? colors.modRejectedText :
    colors.textSecondary;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {/* Toast */}
      <Animated.View style={[styles.toast, { opacity: fadeAnim }]} pointerEvents="none">
        <Text style={styles.toastText}>{message}</Text>
      </Animated.View>

      {/* Button */}
      <Pressable
        onPress={handlePress}
        disabled={state === STATE.SUBMITTING}
        accessibilityRole="button"
        accessibilityLabel="Report a bug"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons
          name={iconName}
          size={22}
          color={iconColor}
          style={state === STATE.SUBMITTING && styles.spinning}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position:       'absolute',
    // Sit above the bottom tab bar so the button never covers the Profile tab.
    // The tab bar's fixed height already accounts for the iOS home indicator.
    bottom:         layout.tabBarHeight + spacing.md,
    right:          spacing.lg,
    alignItems:     'flex-end',
    gap:            spacing.sm,
    zIndex:         9998,
    pointerEvents:  'box-none',
  },
  toast: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    maxWidth:        240,
    ...shadows.card,
  },
  toastText: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  button: {
    width:           44,
    height:          44,
    borderRadius:    radius.pill,
    backgroundColor: colors.surface,
    borderWidth:     1,
    borderColor:     colors.border,
    alignItems:      'center',
    justifyContent:  'center',
    ...shadows.card,
  },
  pressed: {
    opacity: 0.75,
  },
  spinning: {
    // On web we can't easily do rotation via RN Animated without useNativeDriver:false
    // The icon still conveys "working" via the sync icon label.
    opacity: 0.6,
  },
});

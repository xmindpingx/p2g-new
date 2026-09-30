// places2go — WebPhoneFrame
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// places2go is a phone app; on native it fills the device exactly. On a wide
// desktop browser, "full-bleed" instead means the layout stretches across a
// 1440px+ window, which is wrong — the UI was designed at phone width and
// looks broken stretched that wide. This component fixes the ratio and scale:
// on desktop web it renders the app inside a fixed iPhone-sized frame,
// centered on a neutral backdrop; on an actual mobile browser (already the
// right width) or on native, it renders children directly with no change.
//
// Frame content size — 393 x 852 — is the iPhone 15 / 15 Pro logical (point)
// resolution, the standard "modern iPhone" reference size.
//
// IMPORTANT: everything inside the frame must believe it has exactly
// 393 x 852 to work with, not the browser's real window size (a MapScreen
// context menu or the onboarding carousel would otherwise size themselves
// against a 1440px browser window while actually being clipped to ~393px).
// WebFrameContext carries that fixed size down; use the useAppWindowDimensions
// hook (src/hooks/useAppWindowDimensions.js) instead of RN's useWindowDimensions
// anywhere that needs "the screen size" rather than an incidental style value.

import React, { createContext } from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { colors } from '../theme';

// iPhone 15 / 15 Pro point resolution — verified against Apple's published
// specs (webmobilefirst.com, useyourloaf.com), not estimated.
const CONTENT_WIDTH  = 393;
const CONTENT_HEIGHT = 852;

// Simulated device body around the true content area — purely cosmetic, not
// a spec value, sized to read as "a phone" without a fake notch/camera graphic.
const BEZEL          = 14;
const OUTER_RADIUS   = 52;
const INNER_RADIUS   = OUTER_RADIUS - BEZEL;
const OUTER_WIDTH    = CONTENT_WIDTH  + BEZEL * 2;
const OUTER_HEIGHT   = CONTENT_HEIGHT + BEZEL * 2;

// Below this real browser width, treat it as an actual mobile device (already
// correctly sized) rather than a desktop window — comfortably above the
// widest current iPhone content width (430, iPhone 15/16 Plus & Pro Max).
// Exported so anything else that needs to know "is the desktop frame active"
// (App.js's html/body background effect) shares this one definition.
export const NARROW_BREAKPOINT = 520;

export const isDesktopFrameWidth = (width) => Platform.OS === 'web' && width >= NARROW_BREAKPOINT;

// Breathing room between the frame and the browser's edges when scaling to fit.
const VIEWPORT_MARGIN = 32;

// null on native, or on web at mobile width — consumers fall back to the
// real useWindowDimensions(). { width, height } (always CONTENT_WIDTH /
// CONTENT_HEIGHT) once the desktop frame is active.
export const WebFrameContext = createContext(null);

export default function WebPhoneFrame({ children }) {
  // This is the one legitimate use of the real useWindowDimensions() — the
  // frame itself needs the true browser size to decide whether to activate
  // and how much to scale by. Everything inside the frame uses the Context
  // value instead (via useAppWindowDimensions), not this.
  const { width: winW, height: winH } = useWindowDimensions();

  const isDesktopWeb = isDesktopFrameWidth(winW);

  if (!isDesktopWeb) {
    // Native, or a real mobile-width browser: no change from today.
    return <WebFrameContext.Provider value={null}>{children}</WebFrameContext.Provider>;
  }

  const scale = Math.min(
    1,
    (winW - VIEWPORT_MARGIN * 2) / OUTER_WIDTH,
    (winH - VIEWPORT_MARGIN * 2) / OUTER_HEIGHT,
  );

  return (
    <WebFrameContext.Provider value={{ width: CONTENT_WIDTH, height: CONTENT_HEIGHT }}>
      <View style={styles.backdrop}>
        <View style={[styles.body, { transform: [{ scale }] }]}>
          <View style={styles.screen}>{children}</View>
        </View>
      </View>
    </WebFrameContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: colors.webFrameBackdrop,
    // The real app content scrolls inside the frame; the backdrop itself
    // never should (there's nothing to reveal by scrolling a static void).
    overflow: 'hidden',
  },
  body: {
    width:           OUTER_WIDTH,
    height:          OUTER_HEIGHT,
    borderRadius:    OUTER_RADIUS,
    backgroundColor: colors.webFrameBezel,
    padding:         BEZEL,
    // A soft shadow reads as "a device resting on a surface" rather than a
    // flat cutout — modest, not a design flourish the app itself would show.
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 20 },
    shadowOpacity: 0.35,
    shadowRadius:  40,
    elevation:     20,
  },
  screen: {
    flex:            1,
    borderRadius:    INNER_RADIUS,
    overflow:        'hidden',
    backgroundColor: colors.background,
  },
});

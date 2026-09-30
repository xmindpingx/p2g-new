// places2go — useAppWindowDimensions
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Drop-in replacement for React Native's useWindowDimensions() for any
// screen that needs "how much space do I actually have," not just a style
// value. On native, or on an actual mobile-width browser, it IS
// useWindowDimensions() — zero behavior change.
//
// On a desktop browser, WebPhoneFrame (components/WebPhoneFrame.js) renders
// the app inside a fixed-size iPhone frame instead of the full, much wider
// browser window. A screen that measured the real window in that situation
// would size itself for ~1440px while actually being clipped to ~393px —
// this hook returns the frame's fixed content size instead, so a swipeable
// carousel page or a menu-overflow clamp matches what's actually on screen.
//
// Use this (not useWindowDimensions from 'react-native') anywhere a screen
// sizes itself against "the screen," e.g. OnboardingScreen's swipe pages or
// MapScreen's long-press menu clamp.

import { useContext } from 'react';
import { useWindowDimensions } from 'react-native';
import { WebFrameContext } from '../components/WebPhoneFrame';

export default function useAppWindowDimensions() {
  const real  = useWindowDimensions();
  const frame = useContext(WebFrameContext);
  return frame || real;
}

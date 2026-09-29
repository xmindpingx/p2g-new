// places2go — Intro flow routing
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// One place that decides which "beginning" screen comes next:
//   Splash → Terms (mandatory, versioned) → Onboarding → Sign-in → Map.
// "Skip" jumps to the map from any of them, but never past the Terms: legal
// acceptance is the one step that cannot be skipped.

import { ROUTES } from './routes';
import { needsLegalAcceptance } from '../constants/legal';

/**
 * getNextIntroRoute({ legalAcceptance, hasCompletedOnboarding, currentUser })
 */
export function getNextIntroRoute({ legalAcceptance, hasCompletedOnboarding, currentUser }) {
  if (needsLegalAcceptance(legalAcceptance)) return ROUTES.TERMS;
  if (!hasCompletedOnboarding)               return ROUTES.ONBOARDING;
  if (!currentUser?.auth)                    return ROUTES.AUTH;
  return ROUTES.MAIN_TABS;
}

/**
 * getSkipRoute({ legalAcceptance }) — where "Skip" lands.
 */
export function getSkipRoute({ legalAcceptance }) {
  return needsLegalAcceptance(legalAcceptance) ? ROUTES.TERMS : ROUTES.MAIN_TABS;
}

/** After Onboarding's "Get Started" or Skip. */
export function getRouteAfterOnboarding({ legalAcceptance, currentUser }) {
  if (needsLegalAcceptance(legalAcceptance)) return ROUTES.TERMS;
  return currentUser?.auth ? ROUTES.MAIN_TABS : ROUTES.AUTH;
}

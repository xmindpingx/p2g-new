// places2go — Admin test location
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// An administrator can pin the device's location to a chosen point for testing
// (right-click the web map). It is honoured only while ALL of these hold:
//   • the current user is an administrator
//   • Admin Settings → "Allow admins to fake GPS (testing)" is on
// Every sample produced from it carries mocked: true, so the presence check,
// risk flags and automatic approval treat it as the mock location it is, and it
// is never sent to the live map.
import { USER_ROLES } from '../store/useStore';

/** Store selector → { latitude, longitude, setAt } | null */
export const selectDebugLocation = (s) =>
  (s.currentUser?.role === USER_ROLES.ADMIN && s.appSettings?.adminFakeLocationEnabled && s.debugLocation ? s.debugLocation : null);

/** expo-location-shaped position for the test point. */
export const debugPosition = (fake) => ({
  coords: { latitude: fake.latitude, longitude: fake.longitude, accuracy: 5, altitude: null, heading: null, speed: 0 },
  timestamp: Date.now(),
  mocked: true,
});

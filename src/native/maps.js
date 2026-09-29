// places2go — Map platform wrapper (iOS / Android)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Screens import the map from here instead of 'react-native-maps' so Metro can
// pick maps.web.js (Leaflet + OpenStreetMap tiles) when bundling for the web.
export { default, Marker, Polyline } from 'react-native-maps';

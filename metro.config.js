// places2go — Metro configuration
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// zustand ships an ESM build (esm/*.mjs) that reads `import.meta.env`. With
// package exports enabled (Expo SDK 54 default) Metro selects that build for the
// web and the browser fails with "Cannot use 'import.meta' outside a module".
// Native is unaffected because zustand's "react-native" export condition points
// at the CommonJS build. Resolve zustand without package exports on every
// platform so both get the same CommonJS files.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const isZustand = (moduleName) => moduleName === 'zustand' || moduleName.startsWith('zustand/');

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest || context.resolveRequest;
  if (isZustand(moduleName)) {
    return resolve({ ...context, unstable_enablePackageExports: false }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;

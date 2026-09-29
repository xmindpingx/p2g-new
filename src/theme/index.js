// places2go — Design System (final Phase 1)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Default Mode: ON. Utilitarian palette + Inter typography only.
// Additions: admin surface, moderation badge colors, connection status colors,
// amenity chip colors, upload status colors.

export const palette = {
  warmWalnut:  '#4B2E1E', // Comfort · Stability · Home
  softIvory:   '#FDFBF7', // Cleanliness · Openness · Comfort
  heritageGold:'#D4AF37', // Trust · Excellence · Earned
  slate:       '#5A636A', // Clarity · Balance · Information
  softSage:    '#82937D', // Wellness · Calm · Accessibility
  white:       '#FFFFFF',
};

export const colors = {
  // ── Surfaces ─────────────────────────────────────────────────────────────
  background:   palette.softIvory,
  surface:      palette.white,
  surfaceDark:  palette.warmWalnut,

  // ── Brand ─────────────────────────────────────────────────────────────────
  primary:      palette.warmWalnut,
  accent:       palette.heritageGold,
  success:      palette.softSage,

  // ── Text ─────────────────────────────────────────────────────────────────
  textPrimary:  palette.warmWalnut,
  textSecondary:palette.slate,
  textOnDark:   palette.softIvory,
  textOnAccent: palette.warmWalnut,

  // ── Lines / states ────────────────────────────────────────────────────────
  border:       'rgba(90, 99, 106, 0.20)',
  divider:      'rgba(90, 99, 106, 0.12)',
  placeholder:  'rgba(90, 99, 106, 0.60)',
  overlay:      'rgba(75, 46, 30, 0.55)',

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabActive:    palette.warmWalnut,
  tabInactive:  palette.slate,
  tabAddButton: palette.softSage,

  // ── Ratings ───────────────────────────────────────────────────────────────
  star:         palette.heritageGold,
  starEmpty:    'rgba(90, 99, 106, 0.25)',

  // ── Map pins ──────────────────────────────────────────────────────────────
  pinVerified:   palette.softSage,
  pinPending:    palette.slate,
  pinSelected:   palette.heritageGold,
  pinNoRestroom: palette.warmWalnut,   // legacy token; colour-coded pins use pinColors below
  userLocation:  '#2F80ED',

  // ── Partner banner (co-branding) ──────────────────────────────────────────
  // Gold tint so it reads as a labelled partner notice, not as app content.
  partnerBannerBg:     'rgba(212, 175, 55, 0.12)',
  partnerBannerBorder: 'rgba(212, 175, 55, 0.45)',
  partnerBannerLabel:  '#7A6010',                  // same darkened gold as modFlaggedText

  // ── Amenity chips ─────────────────────────────────────────────────────────
  chipActiveBg:      palette.warmWalnut,
  chipActiveText:    palette.softIvory,
  chipInactiveBg:    'rgba(75, 46, 30, 0.07)',
  chipInactiveText:  palette.warmWalnut,
  chipInactiveBorder:'rgba(75, 46, 30, 0.20)',

  // ── Admin / mod surfaces ──────────────────────────────────────────────────
  // A warm off-white tinted slightly darker than background so the admin
  // panel reads as a distinct area without introducing a new hue.
  adminSurface:       '#F5F0E8',
  adminBorder:        'rgba(75, 46, 30, 0.15)',
  adminHeaderBg:      palette.warmWalnut,
  adminHeaderText:    palette.softIvory,

  // Mod queue badge — uses Slate so it reads as "informational, not alarming"
  modBadgeBg:         palette.slate,
  modBadgeText:       palette.white,

  // ── Moderation status badges ──────────────────────────────────────────────
  // All derived from the existing palette hues; no new brand colors.
  modPendingBg:       'rgba(90, 99, 106, 0.12)',   // Slate tint — neutral / waiting
  modPendingText:     palette.slate,

  modFlaggedBg:       'rgba(212, 175, 55, 0.18)',  // Gold tint — attention required
  modFlaggedText:     '#7A6010',                   // Darkened gold for legibility

  modCleanBg:         'rgba(130, 147, 125, 0.18)', // Sage tint — all clear
  modCleanText:       '#4A5C46',                   // Darkened sage

  modRejectedBg:      'rgba(75, 46, 30, 0.12)',    // Walnut tint — content removed
  modRejectedText:    palette.warmWalnut,

  modApprovedBg:      'rgba(130, 147, 125, 0.18)', // Same as clean
  modApprovedText:    '#4A5C46',

  modUnderReviewBg:   'rgba(212, 175, 55, 0.18)',  // Same as flagged
  modUnderReviewText: '#7A6010',

  // ── Ollama connection status ───────────────────────────────────────────────
  connVerifiedBg:     'rgba(130, 147, 125, 0.18)',
  connVerifiedText:   '#4A5C46',
  connVerifiedDot:    palette.softSage,

  connUnverifiedBg:   'rgba(90, 99, 106, 0.12)',
  connUnverifiedText: palette.slate,
  connUnverifiedDot:  palette.slate,

  connErrorBg:        'rgba(212, 175, 55, 0.18)',
  connErrorText:      '#7A6010',
  connErrorDot:       palette.heritageGold,

  // ── Photo upload status ───────────────────────────────────────────────────
  uploadLocalBg:     'rgba(90, 99, 106, 0.10)',
  uploadLocalText:   palette.slate,
  uploadingBg:       'rgba(212, 175, 55, 0.15)',
  uploadingText:     '#7A6010',
  uploadedBg:        'rgba(130, 147, 125, 0.18)',
  uploadedText:      '#4A5C46',
  uploadFailedBg:    'rgba(75, 46, 30, 0.12)',
  uploadFailedText:  palette.warmWalnut,
};

// ── Colour-coded map pins (semantic; requested scheme) ──────────────────────
export const pinColors = {
  noneOnSite:   '#1F1F1F', // black  — no restroom on site
  notPublic:    '#C0392B', // red    — restroom not open to the public
  purchase:     '#2E8B57', // green  — purchase required
  normal:       '#2F80ED', // blue   — normal free restroom
  lowRated:     '#E5B800', // yellow — low rated
  unsafe:       '#E67E22', // orange — flagged unsafe by visitors
  nice:         '#A8B0B8', // silver — highly rated
  best:         palette.heritageGold, // gold — best-rated within the admin radius
};

export const fonts = {
  regular:  'Inter_400Regular',
  medium:   'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold:     'Inter_700Bold',
};

export const fontSizes = {
  xs:      11,
  sm:      13,
  md:      15,
  lg:      17,
  xl:      20,
  xxl:     24,
  display: 32,
};

export const lineHeights = {
  xs:      14,
  sm:      18,
  md:      22,
  lg:      24,
  xl:      28,
  xxl:     32,
  display: 40,
};

export const typography = {
  display: {
    fontFamily: fonts.bold,
    fontSize:   fontSizes.display,
    lineHeight: lineHeights.display,
    color:      colors.textPrimary,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSizes.xxl,
    lineHeight: lineHeights.xxl,
    color:      colors.textPrimary,
  },
  heading: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSizes.xl,
    lineHeight: lineHeights.xl,
    color:      colors.textPrimary,
  },
  subheading: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSizes.lg,
    lineHeight: lineHeights.lg,
    color:      colors.textPrimary,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize:   fontSizes.md,
    lineHeight: lineHeights.md,
    color:      colors.textPrimary,
  },
  bodyMedium: {
    fontFamily: fonts.medium,
    fontSize:   fontSizes.md,
    lineHeight: lineHeights.md,
    color:      colors.textPrimary,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize:   fontSizes.sm,
    lineHeight: lineHeights.sm,
    color:      colors.textSecondary,
  },
  captionMedium: {
    fontFamily: fonts.medium,
    fontSize:   fontSizes.sm,
    lineHeight: lineHeights.sm,
    color:      colors.textSecondary,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize:   fontSizes.xs,
    lineHeight: lineHeights.xs,
    color:      colors.textSecondary,
  },
  button: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSizes.md,
    lineHeight: lineHeights.md,
    color:      colors.textOnDark,
  },
  tabLabel: {
    fontFamily: fonts.medium,
    fontSize:   fontSizes.xs,
    lineHeight: lineHeights.xs,
  },
  // Admin-specific type tokens
  adminSectionHeader: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSizes.xs,
    lineHeight: lineHeights.xs,
    color:      colors.textSecondary,
    letterSpacing: 0.8,
  },
  adminValue: {
    fontFamily: fonts.medium,
    fontSize:   fontSizes.md,
    lineHeight: lineHeights.md,
    color:      colors.textPrimary,
  },
  badge: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSizes.xs,
    lineHeight: lineHeights.xs,
  },
};

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
};

export const radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor:   palette.warmWalnut,
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius:  12,
    elevation:     3,
  },
  floating: {
    shadowColor:   palette.warmWalnut,
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius:  20,
    elevation:     8,
  },
};

const theme = {
  palette,
  colors,
  pinColors,
  fonts,
  fontSizes,
  lineHeights,
  typography,
  spacing,
  radius,
  shadows,
};

export default theme;

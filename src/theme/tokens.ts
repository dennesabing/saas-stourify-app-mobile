/**
 * Wander D4 · Coastal Azure — design tokens.
 *
 * Transcribed from the locked handoff at
 * `docs/Project - Stourify/_ds/stourify-design-system-<id>/styles.css`.
 * That file is the source of truth: if a value here disagrees with it, this
 * file is wrong. Screens consume these through `useTheme()` — never a literal.
 */

export const palette = {
  light: {
    /** App background — cool paper. */
    surface: '#F3F7FB',
    /** Raised sections, sheets. */
    surfaceAlt: '#E9EFF5',
    card: '#FFFFFF',
    /** Primary text. */
    ink: '#152230',
    /** Secondary text. */
    muted: '#647686',
    /** Brand — wordmark, active tab, links, Follow, focus ring. */
    primary: '#1C6FB0',
    /** Primary filled button background — deep slate, not the brand azure. */
    button: '#2E4A63',
    onButton: '#FFFFFF',
    /** Center + / FAB, energy highlights. */
    accent: '#EB7A50',
    /** Rating stars, subtle highlights. */
    accent2: '#3FA7C4',
    badgeInk: '#2E4A63',
    badgeBg: 'rgba(28,111,176,0.10)',
    success: '#2E9E6B',
    danger: '#C0492F',
    /** 1px dividers and borders. */
    hairline: 'rgba(21,34,48,0.12)',
  },
  dark: {
    surface: '#0E1621',
    surfaceAlt: '#16212E',
    card: '#16212E',
    ink: '#EAF0F6',
    muted: '#93A2B2',
    primary: '#4C9BD6',
    button: '#3A5A7D',
    onButton: '#FFFFFF',
    accent: '#F08A5D',
    accent2: '#5CB8D4',
    badgeInk: '#9FC3E4',
    badgeBg: 'rgba(76,155,214,0.16)',
    success: '#47B784',
    danger: '#E06A5A',
    hairline: 'rgba(255,255,255,0.10)',
  },
} as const

export type ColorScheme = keyof typeof palette
export type ColorRole = keyof (typeof palette)['light']

/**
 * Widened to `string` on purpose: `as const` above gives each palette its own
 * literal types, so the light and dark objects would otherwise be mutually
 * unassignable and no single `Theme` could hold either.
 */
export type Colors = Record<ColorRole, string>

/**
 * Font families.
 *
 * The keys match the names registered by `useAppFonts()`. When the Google
 * fonts have not finished loading, `fontFamily: undefined` falls back to the
 * platform default rather than rendering a missing-glyph box.
 */
export const fontFamily = {
  displayMedium: 'Fraunces_500Medium',
  displaySemiBold: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const

/**
 * The type scale, one entry per role in the handoff.
 *
 * Fraunces for titles, Inter for UI — the split is deliberate and is what
 * makes the system read as editorial rather than generic.
 */
export const typography = {
  /** Screen heroes, spot titles. */
  display: { fontFamily: fontFamily.displayBold, fontSize: 32, lineHeight: 38 },
  /** Section titles. */
  h1: { fontFamily: fontFamily.displayBold, fontSize: 24, lineHeight: 30 },
  /** Card titles. */
  h2: { fontFamily: fontFamily.displaySemiBold, fontSize: 20, lineHeight: 26 },
  /** Descriptions. */
  bodyLg: { fontFamily: fontFamily.bodyRegular, fontSize: 17, lineHeight: 24 },
  /** Default. */
  body: { fontFamily: fontFamily.bodyRegular, fontSize: 15, lineHeight: 22 },
  /** Meta, labels. */
  caption: { fontFamily: fontFamily.bodyMedium, fontSize: 13, lineHeight: 18 },
  /** Chips and badges — always uppercase. */
  micro: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
  /** Button label — not in the CSS scale, derived from the mockups. */
  button: { fontFamily: fontFamily.bodySemiBold, fontSize: 15, lineHeight: 20 },
} as const

export type TypographyVariant = keyof typeof typography

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
} as const

/** Screen gutter — the handoff allows 16–20; 16 is the default. */
export const gutter = 16

export const radius = {
  card: 18,
  button: 12,
  /** Category tags. */
  tag: 6,
  /** Filter chips — pill. */
  chip: 999,
  /** Sheets — top corners only. */
  sheet: 24,
  avatar: 9999,
} as const

/**
 * Elevation. RN needs shadow* on iOS and elevation on Android, so each token
 * carries both rather than leaving one platform flat.
 */
export const elevation = {
  raised: {
    shadowColor: '#152230',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  floating: {
    shadowColor: '#152230',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const

export const motion = {
  fast: 200,
  base: 230,
  slow: 260,
} as const

/**
 * Minimum interactive size. Non-negotiable — it is in the definition of done
 * (`docs/mobile-delivery/technical-spec.md` §10) and is an accessibility
 * requirement, not a style preference.
 */
export const minTouchTarget = 44

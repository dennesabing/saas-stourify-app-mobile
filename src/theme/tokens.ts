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
    /**
     * The tint behind a destructive row's icon — Log out, Delete account.
     *
     * **Not in the handoff's token list**: the Settings canvas writes it inline
     * as `.row.danger .ic { background: rgba(192,73,47,.12) }`, which is
     * `danger` at 12%. It is named here so a screen never has to write it
     * (STOURIFY-290).
     */
    dangerBg: 'rgba(192,73,47,0.12)',
    /**
     * The tint behind a success tile — Forgot password's "Check your inbox".
     * Written inline in the Auth & Entry canvas as `rgba(46,158,107,.14)`, which
     * is `success` at 14% (STOURIFY-286).
     */
    successBg: 'rgba(46,158,107,0.14)',
    /**
     * The brand gradient behind Splash and Welcome, top-left to bottom-right.
     * The Auth & Entry canvas draws it as
     * `linear-gradient(165deg,#0f4c73,#1C8FC4 55%,#3FA7C4)` (STOURIFY-286).
     */
    heroFrom: '#0F4C73',
    heroVia: '#1C8FC4',
    heroTo: '#3FA7C4',
    /** The navy Welcome fades to at the bottom, so white text stays readable there. */
    heroShade: '#0B1F36',
    /** A white wash for a tile drawn on the gradient — Splash's compass. */
    heroTint: 'rgba(255,255,255,0.14)',
    /** The outline of that tile. */
    heroLine: 'rgba(255,255,255,0.28)',
    /** 1px dividers and borders. */
    hairline: 'rgba(21,34,48,0.12)',
    /**
     * The dim behind a sheet or dialog.
     *
     * **Not in the handoff** — `styles.css` specifies `--radius-sheet` and an
     * `--elev-floating` shadow for sheets but never the scrim behind one, so
     * there was no value to transcribe (STOURIFY-37). Derived from `ink` at 55%,
     * which is the same base the hairline is derived from; the light palette
     * needs the heavier value because the sheet it dims is nearly white.
     *
     * It lives here rather than inline in `Sheet.tsx` for the reason at the top
     * of this file: a screen never writes a colour literal. If the handoff ever
     * names a scrim, this is the one line to correct.
     */
    scrim: 'rgba(21,34,48,0.55)',
    /**
     * The dark wash under a control that floats on a photo: the Spot Hub's round
     * Back and Save buttons (`.cbtn`, 42%) and its "1 / N" counter (`.pc`, 60%).
     *
     * **Not in the handoff's token list**: the Spot Hub canvas writes both inline
     * as `rgba(11,22,34,…)` (STOURIFY-292). The dark palette carries the same
     * values, because what sits under them is a photograph, not the page.
     */
    overlay: 'rgba(11,22,34,0.42)',
    overlayStrong: 'rgba(11,22,34,0.60)',
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
    /** See the light palette's note. The dark `danger` at 16%, matching `badgeBg`'s weight here. */
    dangerBg: 'rgba(224,106,90,0.16)',
    /** See the light palette's note. The dark `success` at 16%, matching `dangerBg`. */
    successBg: 'rgba(71,183,132,0.16)',
    /**
     * Not in the handoff: the canvas draws the brand screens in light only. The
     * same three blues, deepened, so a dark phone is not met by a bright slab.
     */
    heroFrom: '#082336',
    heroVia: '#115B85',
    heroTo: '#1F7892',
    heroShade: '#03080E',
    heroTint: 'rgba(255,255,255,0.14)',
    heroLine: 'rgba(255,255,255,0.28)',
    hairline: 'rgba(255,255,255,0.10)',
    /** See the light palette's note. Darker, because the sheet above it is dark. */
    scrim: 'rgba(3,8,14,0.70)',
    /** See the light palette's note. Identical: it darkens a photo, not the page. */
    overlay: 'rgba(11,22,34,0.42)',
    overlayStrong: 'rgba(11,22,34,0.60)',
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
 *
 * On Android each name is also the file name of a font the build ships inside
 * the APK (android/app/build.gradle → bundledFonts), which is what keeps labels
 * from being measured in the system font and clipped (STOURIFY-263).
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

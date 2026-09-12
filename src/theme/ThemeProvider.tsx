import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { useAppearanceStore } from './appearance'
import {
  elevation,
  fontFamily,
  gutter,
  minTouchTarget,
  motion,
  palette,
  radius,
  spacing,
  typography,
  type Colors,
  type ColorScheme,
} from './tokens'

export interface Theme {
  scheme: ColorScheme
  colors: Colors
  /**
   * The families, for the few places a type role needs a different weight —
   * the design's `.chip` is 600, where `caption` is 500 (STOURIFY-257).
   */
  fontFamily: typeof fontFamily
  typography: typeof typography
  spacing: typeof spacing
  gutter: number
  radius: typeof radius
  elevation: typeof elevation
  motion: typeof motion
  minTouchTarget: number
}

function buildTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    colors: palette[scheme],
    fontFamily,
    typography,
    spacing,
    gutter,
    radius,
    elevation,
    motion,
    minTouchTarget,
  }
}

const ThemeContext = createContext<Theme>(buildTheme('light'))

interface Props {
  children: ReactNode
  /** Force a scheme. Used by the theme gallery and by tests; omit in the app. */
  scheme?: ColorScheme
}

/**
 * Supplies the Wander D4 theme.
 *
 * Which palette, in order: a forced `scheme` (the theme gallery, tests); then
 * the Settings → Appearance choice when it is Light or Dark; then, on System,
 * whatever the phone is set to (STOURIFY-290). Both palettes are locked in the
 * handoff, so dark mode is a first-class target — not an afterthought that
 * screens opt into one at a time.
 *
 * The choice is read here directly, and not only through `useColorScheme()`
 * after `Appearance.setColorScheme()`, so every screen repaints the moment the
 * choice changes rather than after Android's round trip.
 */
export function ThemeProvider({ children, scheme }: Props) {
  const systemScheme = useColorScheme()
  const choice = useAppearanceStore((state) => state.choice)
  const chosen: ColorScheme | null = choice === 'system' ? null : choice
  const resolved: ColorScheme = scheme ?? chosen ?? (systemScheme === 'dark' ? 'dark' : 'light')
  const theme = useMemo(() => buildTheme(resolved), [resolved])

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  return useContext(ThemeContext)
}

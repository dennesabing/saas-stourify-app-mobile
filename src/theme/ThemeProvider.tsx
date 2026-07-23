import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import {
  elevation,
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
 * Follows the OS appearance by default. Both palettes are locked in the
 * handoff, so dark mode is a first-class target — not an afterthought that
 * screens opt into one at a time.
 */
export function ThemeProvider({ children, scheme }: Props) {
  const systemScheme = useColorScheme()
  const resolved: ColorScheme = scheme ?? (systemScheme === 'dark' ? 'dark' : 'light')
  const theme = useMemo(() => buildTheme(resolved), [resolved])

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  return useContext(ThemeContext)
}

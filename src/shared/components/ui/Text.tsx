import { Text as RNText, type TextProps as RNTextProps } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import type { TypographyVariant } from '@/theme/tokens'

type ColorRole =
  'ink' | 'muted' | 'primary' | 'accent' | 'onButton' | 'danger' | 'success' | 'badgeInk'

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant
  color?: ColorRole
}

/**
 * The only text primitive. Screens never reach for RN's `Text` directly — that
 * is how a type scale erodes into a hundred one-off font sizes.
 */
export default function Text({ variant = 'body', color = 'ink', style, ...rest }: TextProps) {
  const theme = useTheme()

  return (
    <RNText {...rest} style={[theme.typography[variant], { color: theme.colors[color] }, style]} />
  )
}

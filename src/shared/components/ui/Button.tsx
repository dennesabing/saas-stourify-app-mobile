import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

interface Props {
  label: string
  /**
   * A short decorative glyph drawn before the label — an emoji or a symbol
   * character, not an icon component. It makes an icon-plus-text button out of
   * the row this component already lays out, so a caller never hand-rolls one
   * (STOURIFY-102). It is deliberately excluded from the accessibility label:
   * a screen reader should say "Save", not "bookmark Save".
   */
  icon?: string
  onPress?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  style?: ViewStyle
  /** Screen-reader label when the visible text is not descriptive enough. */
  accessibilityLabel?: string
}

export default function Button({
  label,
  icon,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  accessibilityLabel,
}: Props) {
  const theme = useTheme()
  const isInert = disabled || loading

  // The handoff is specific here: the filled button is deep slate, NOT the
  // brand azure. Azure is reserved for links, active tabs and Follow.
  const background: Record<ButtonVariant, string> = {
    primary: theme.colors.button,
    secondary: 'transparent',
    accent: theme.colors.accent,
    ghost: 'transparent',
    danger: theme.colors.danger,
  }

  const labelColor = {
    primary: 'onButton',
    secondary: 'ink',
    accent: 'onButton',
    ghost: 'primary',
    danger: 'onButton',
  }[variant] as 'onButton' | 'ink' | 'primary'

  return (
    <Pressable
      onPress={onPress}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isInert, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background[variant],
          borderRadius: theme.radius.button,
          minHeight: size === 'lg' ? 52 : theme.minTouchTarget,
          paddingHorizontal: size === 'lg' ? theme.spacing[6] : theme.spacing[5],
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: theme.colors.hairline,
          opacity: isInert ? 0.5 : pressed ? 0.85 : 1,
          width: fullWidth ? '100%' : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'secondary' || variant === 'ghost'
              ? theme.colors.primary
              : theme.colors.onButton
          }
        />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <Text variant="button" color={labelColor}>
              {icon}
            </Text>
          ) : null}
          {/*
            One line, always. Two buttons side by side each take half the row,
            and a label long enough to wrap makes them different heights — the
            defect this fixes (STOURIFY-102). `flexShrink` on both the label and
            the row around it is what lets React Native ellipsize the text
            instead of letting it push past the button's edge.
          */}
          <Text variant="button" color={labelColor} numberOfLines={1} style={styles.label}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  label: { flexShrink: 1 },
})

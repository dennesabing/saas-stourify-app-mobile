import { Pressable, View, type ViewStyle } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  children: React.ReactNode
  onPress?: () => void
  /** Raised cards lift off the paper background; flat ones sit on it. */
  raised?: boolean
  padded?: boolean
  style?: ViewStyle
  accessibilityLabel?: string
}

export default function Card({
  children,
  onPress,
  raised = true,
  padded = true,
  style,
  accessibilityLabel,
}: Props) {
  const theme = useTheme()

  const base: ViewStyle = {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.card,
    padding: padded ? theme.spacing[4] : 0,
    overflow: 'hidden',
    ...(raised ? theme.elevation.raised : { borderWidth: 1, borderColor: theme.colors.hairline }),
  }

  if (!onPress) {
    return <View style={[base, style]}>{children}</View>
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, { opacity: pressed ? 0.92 : 1 }, style]}
    >
      {children}
    </Pressable>
  )
}

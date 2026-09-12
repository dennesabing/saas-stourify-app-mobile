import { Pressable, View } from 'react-native'
import { Icon, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  following: boolean
  /** Who the pill is about, so a screen reader says "Follow Ana", not a row of "Follow". */
  name: string
  onPress: () => void
  disabled?: boolean
}

/** How tall the pill is drawn; `hitSlop` makes the touch target up to the 44-point minimum. */
const PILL_HEIGHT = 36

/**
 * The Follow Suggestions pill (artboard 4): a filled slate "Follow" that
 * becomes an azure-outlined "Following" with a tick once the follow lands.
 */
export default function FollowPill({ following, name, onPress, disabled }: Props) {
  const theme = useTheme()
  const slop = (theme.minTouchTarget - PILL_HEIGHT) / 2
  const shape = {
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }

  if (following) {
    return (
      <View
        style={{
          ...shape,
          flexDirection: 'row',
          gap: 5,
          paddingHorizontal: 14,
          borderWidth: 1.5,
          borderColor: theme.colors.primary,
        }}
      >
        <Icon name="check" size={14} color="primary" strokeWidth={3} />
        <Text
          variant="caption"
          color="primary"
          style={{ fontFamily: theme.fontFamily.bodySemiBold }}
        >
          Following
        </Text>
      </View>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Follow ${name}`}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={{ top: slop, bottom: slop }}
      style={({ pressed }) => ({
        ...shape,
        paddingHorizontal: 18,
        backgroundColor: theme.colors.button,
        opacity: pressed || disabled ? 0.7 : 1,
      })}
    >
      <Text
        variant="caption"
        color="onButton"
        style={{ fontFamily: theme.fontFamily.bodySemiBold }}
      >
        Follow
      </Text>
    </Pressable>
  )
}

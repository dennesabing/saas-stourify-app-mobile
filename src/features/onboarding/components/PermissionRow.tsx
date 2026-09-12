import { Pressable, View } from 'react-native'
import { Icon, Text } from '@/shared/components/ui'
import type { IconName } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  icon: IconName
  /** One word — "Location". The pill's spoken label is built from it. */
  title: string
  description: string
  granted: boolean
  /** True while the phone's own prompt is up, so a second tap cannot stack a second prompt. */
  busy?: boolean
  onAllow: () => void
}

/** How tall the pill is drawn; `hitSlop` makes the touch target up to the 44-point minimum. */
const PILL_HEIGHT = 36

/**
 * One permission on the Permissions step (artboard 1): the rounded icon tile,
 * the title and its one-line reason, and a pill at the right that reads
 * "Allow" until the phone says yes and a green "Allowed" after.
 */
export default function PermissionRow({ icon, title, description, granted, busy, onAllow }: Props) {
  const theme = useTheme()
  const slop = (theme.minTouchTarget - PILL_HEIGHT) / 2

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: theme.spacing[4],
        borderRadius: theme.radius.card,
        borderWidth: 1,
        borderColor: theme.colors.hairline,
        backgroundColor: theme.colors.card,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.badgeBg,
        }}
      >
        <Icon name={icon} size={24} color="primary" />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" style={{ fontFamily: theme.fontFamily.bodySemiBold }}>
          {title}
        </Text>
        <Text variant="caption" color="muted">
          {description}
        </Text>
      </View>

      {granted ? (
        <View
          accessible
          accessibilityLabel={`${title} allowed`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            height: PILL_HEIGHT,
            paddingHorizontal: 13,
            borderRadius: theme.radius.button,
            backgroundColor: theme.colors.successBg,
          }}
        >
          <Icon name="check" size={15} color="success" strokeWidth={3} />
          <Text
            variant="caption"
            color="success"
            style={{ fontFamily: theme.fontFamily.bodySemiBold }}
          >
            Allowed
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={onAllow}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Allow ${title.toLowerCase()}`}
          accessibilityState={{ disabled: !!busy, busy: !!busy }}
          hitSlop={{ top: slop, bottom: slop }}
          style={({ pressed }) => ({
            height: PILL_HEIGHT,
            justifyContent: 'center',
            paddingHorizontal: 15,
            borderRadius: theme.radius.button,
            backgroundColor: theme.colors.button,
            opacity: pressed || busy ? 0.7 : 1,
          })}
        >
          <Text
            variant="caption"
            color="onButton"
            style={{ fontFamily: theme.fontFamily.bodySemiBold }}
          >
            Allow
          </Text>
        </Pressable>
      )}
    </View>
  )
}

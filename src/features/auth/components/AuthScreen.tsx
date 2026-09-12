import type { ReactNode } from 'react'
import { View } from 'react-native'
import { BackButton, Icon, KeyboardAwareScreen, Text } from '@/shared/components/ui'
import type { IconName } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

interface ScreenProps {
  /** Draws the round back disc above everything else. Omit for no way back. */
  onBack?: () => void
  children: ReactNode
}

/**
 * The frame every form in the Auth & Entry design sits in (STOURIFY-286): the
 * back disc top-left, the heading, the fields, then — pushed to the bottom by
 * `AuthSpacer` — the main button and the "…? Log in" line.
 *
 * It is `KeyboardAwareScreen` underneath, so a field never sits behind the
 * keyboard (STOURIFY-100). The design pins the button to the bottom of the
 * phone; on a short screen, or with the keyboard up, the spacer collapses and
 * the whole form scrolls instead of anything being cut off.
 */
export function AuthScreen({ onBack, children }: ScreenProps) {
  const theme = useTheme()

  return (
    <KeyboardAwareScreen
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: theme.spacing[6],
        paddingTop: theme.spacing[2],
        paddingBottom: theme.spacing[6],
      }}
    >
      {onBack ? <BackButton size={42} onPress={onBack} /> : null}
      {children}
    </KeyboardAwareScreen>
  )
}

/** The stretch between the fields and the bottom button. Never less than 24 points. */
export function AuthSpacer() {
  const theme = useTheme()
  return <View style={{ flexGrow: 1, minHeight: theme.spacing[6] }} />
}

interface HeadingProps {
  title: string
  /** A string, or text with a bold part — Check your inbox names the address. */
  subtitle?: ReactNode
}

/** The design's big Fraunces title and the grey sentence under it. */
export function AuthHeading({ title, subtitle }: HeadingProps) {
  return (
    <View style={{ gap: 9 }}>
      <Text variant="display" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" color="muted">
          {subtitle}
        </Text>
      ) : null}
    </View>
  )
}

interface TileProps {
  icon: IconName
  /** `success` is the green tile behind a finished step; the default is the brand's. */
  tone?: 'primary' | 'success'
}

/** The 74-point rounded tile above Forgot password's and Reset password's titles. */
export function AuthIconTile({ icon, tone = 'primary' }: TileProps) {
  const theme = useTheme()

  return (
    <View
      style={{
        width: 74,
        height: 74,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'success' ? theme.colors.successBg : theme.colors.badgeBg,
      }}
    >
      <Icon name={icon} size={34} color={tone} strokeWidth={tone === 'success' ? 2 : 1.8} />
    </View>
  )
}

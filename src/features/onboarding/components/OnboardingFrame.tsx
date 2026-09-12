import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AuthHeading } from '@/features/auth/components/AuthScreen'
import { Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

/** How many screens the onboarding stack has — the progress bar's segment count. */
export const ONBOARDING_STEPS = 4

interface Props {
  /** Which screen this is, from 1. That many segments of the bar are filled. */
  step: number
  onSkip: () => void
  title: string
  subtitle: string
  children: ReactNode
  /** The main button, pinned to the bottom of the phone. */
  footer: ReactNode
}

/**
 * The page every onboarding screen is printed on (STOURIFY-287): the four-part
 * progress bar with Skip at its right, the big Fraunces title and its grey line
 * (the same `AuthHeading` the sign-in screens use), the screen's own content,
 * then the main button pinned to the bottom.
 *
 * ## Why `edges` names `bottom` as well as `top`
 *
 * A phone reserves a strip along the bottom of the screen for its own back,
 * home and recents controls, and tells each app how tall that strip is.
 * `edges` is the list of sides `SafeAreaView` is allowed to pad, so naming only
 * `top` would leave the pinned button free to sit underneath the phone's own
 * bar — where a tap can land on the system instead of the app.
 *
 * The rest of the app gets away with `top` alone because every other screen
 * sits inside the tab navigator and its tab bar already occupies the strip.
 * Onboarding is its own stack with no tab bar (STOURIFY-81). The four screens
 * used to state the rule one by one; it lives here now, once, and
 * `__tests__/features/onboarding/safeAreaEdges.test.tsx` still checks every
 * screen.
 */
export default function OnboardingFrame({
  step,
  onSkip,
  title,
  subtitle,
  children,
  footer,
}: Props) {
  const theme = useTheme()

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
      edges={['top', 'bottom']}
    >
      <View style={{ flex: 1, paddingHorizontal: theme.spacing[6], paddingTop: theme.spacing[2] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing[3],
            minHeight: theme.minTouchTarget,
          }}
        >
          <ProgressBar step={step} />
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            hitSlop={theme.spacing[2]}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text variant="button" color="muted">
              Skip
            </Text>
          </Pressable>
        </View>

        <View style={{ marginTop: theme.spacing[4] }}>
          <AuthHeading title={title} subtitle={subtitle} />
        </View>

        <View style={{ flex: 1, marginTop: theme.spacing[5] }}>{children}</View>
      </View>

      <View
        style={{
          paddingHorizontal: theme.spacing[6],
          paddingTop: theme.spacing[3],
          paddingBottom: theme.spacing[6],
        }}
      >
        {footer}
      </View>
    </SafeAreaView>
  )
}

/**
 * The design's thin bar of four segments: the ones already reached are azure,
 * the rest are the hairline colour. It says in words what it draws, because a
 * screen reader cannot see a colour.
 */
function ProgressBar({ step }: { step: number }) {
  const theme = useTheme()

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${ONBOARDING_STEPS}`}
      accessibilityValue={{ min: 1, max: ONBOARDING_STEPS, now: step }}
      style={{ flex: 1, flexDirection: 'row', gap: 6 }}
    >
      {Array.from({ length: ONBOARDING_STEPS }, (_, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: 5,
            borderRadius: 3,
            backgroundColor: index < step ? theme.colors.primary : theme.colors.hairline,
          }}
        />
      ))}
    </View>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { AppState, Linking, View } from 'react-native'
import * as Location from 'expo-location'
import { Camera } from 'expo-camera'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { OnboardingStackParamList } from '@/shared/navigation/types'
import { Button } from '@/shared/components/ui'
import OnboardingFrame from '@/features/onboarding/components/OnboardingFrame'
import PermissionRow from '@/features/onboarding/components/PermissionRow'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Permissions'>

type Kind = 'location' | 'camera'

interface Answer {
  granted: boolean
  canAskAgain: boolean
}

/** The phone's own permission calls, one pair per row. */
const ASK: Record<Kind, { read: () => Promise<Answer>; request: () => Promise<Answer> }> = {
  location: {
    read: () => Location.getForegroundPermissionsAsync(),
    request: () => Location.requestForegroundPermissionsAsync(),
  },
  camera: {
    read: () => Camera.getCameraPermissionsAsync(),
    request: () => Camera.requestCameraPermissionsAsync(),
  },
}

const KINDS: Kind[] = ['location', 'camera']

/**
 * Artboard 1 of the Onboarding design (STOURIFY-287): one row per permission,
 * each with its own "Allow" pill.
 *
 * Location and Camera only. The design also draws Notifications, but
 * `expo-notifications` is not installed and push is M5 work; asking for a
 * permission this app cannot act on is worse than not asking. Camera is the
 * same permission `CameraCaptureScreen` asks for at the first photo, asked
 * earlier — a refusal here changes nothing, because capture asks again.
 *
 * Each row explains itself BEFORE its OS prompt, deliberately: requesting cold,
 * with no explanation on screen first, is the top reason a permission prompt
 * gets a permanent "Don't ask again". That is also why Continue asks for
 * nothing — only a tap on a row's own pill does.
 *
 * Every tap re-reads the phone's answer first. After "Don't ask again" a
 * request returns an instant no without showing anything, so the pill would
 * look dead; in that case it opens the app's system settings instead. The rows
 * re-read when the app comes back to the front, so a yes given in Settings
 * shows up without leaving the screen.
 */
export default function PermissionsScreen({ navigation }: Props) {
  const theme = useTheme()
  const [answers, setAnswers] = useState<Record<Kind, Answer | null>>({
    location: null,
    camera: null,
  })
  const [asking, setAsking] = useState<Kind | null>(null)

  const record = useCallback((kind: Kind, answer: Answer) => {
    setAnswers((prev) => ({
      ...prev,
      [kind]: { granted: answer.granted, canAskAgain: answer.canAskAgain },
    }))
  }, [])

  const readAll = useCallback(() => {
    KINDS.forEach((kind) => {
      ASK[kind]
        .read()
        .then((answer) => record(kind, answer))
        .catch(() => undefined)
    })
  }, [record])

  useEffect(() => {
    readAll()

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') readAll()
    })

    return () => subscription.remove()
  }, [readAll])

  async function allow(kind: Kind): Promise<void> {
    setAsking(kind)

    try {
      const current = await ASK[kind].read()

      if (current.granted) {
        record(kind, current)
      } else if (!current.canAskAgain) {
        await Linking.openSettings()
      } else {
        record(kind, await ASK[kind].request())
      }
    } catch {
      // The pill stays on Allow, which is the truthful state after a failure.
    } finally {
      setAsking(null)
    }
  }

  const next = () => navigation.navigate('Interests')

  return (
    <OnboardingFrame
      step={1}
      onSkip={next}
      title="Enable the essentials"
      subtitle="Stourify works best with a few permissions. You're always in control."
      footer={<Button label="Continue" size="lg" onPress={next} fullWidth />}
    >
      <View style={{ gap: 14 }}>
        <PermissionRow
          icon="pin"
          title="Location"
          description="Find hidden spots right around you."
          granted={answers.location?.granted === true}
          busy={asking === 'location'}
          onAllow={() => void allow('location')}
        />
        <PermissionRow
          icon="camera"
          title="Camera"
          description="Capture and share your own finds."
          granted={answers.camera?.granted === true}
          busy={asking === 'camera'}
          onAllow={() => void allow('camera')}
        />
      </View>
      <View style={{ height: theme.spacing[2] }} />
    </OnboardingFrame>
  )
}

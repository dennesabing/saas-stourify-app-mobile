import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Card, Text } from '@/shared/components/ui'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<CreateStackParamList, 'CreateMenu'>

/**
 * The Create sheet — the branch point behind the coral centre tab.
 *
 * Only "New Spot" is wired for the beta: Collections and Trails are deferred
 * (`docs/mobile-delivery/technical-spec.md` §3), so they are shown as coming
 * rather than hidden, which keeps the deck's shape recognisable.
 */
export default function CreateMenuScreen({ navigation }: Props) {
  const theme = useTheme()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surfaceAlt }} edges={['top']}>
      <View style={{ padding: theme.gutter, gap: theme.spacing[4] }}>
        <Text variant="h1">Create</Text>
        <Text variant="body" color="muted">
          What would you like to add?
        </Text>

        <Card onPress={() => navigation.navigate('CreateSpot')} accessibilityLabel="New Spot">
          <Text variant="h2">New Spot</Text>
          <Text variant="caption" color="muted">
            Share a place you discovered
          </Text>
        </Card>

        {/*
          `MediaPicker` is the only route into `PostCompose`, and until
          STOURIFY-18 nothing navigated to it — the compose screen was
          unreachable through the UI, which is how two silent contract defects on
          it went unnoticed. An unreachable screen cannot be live-verified either.
        */}
        <Card onPress={() => navigation.navigate('MediaPicker')} accessibilityLabel="New Post">
          <Text variant="h2">New Post</Text>
          <Text variant="caption" color="muted">
            Post a photo from a place you have been
          </Text>
        </Card>

        {/*
          A temporary entry point. The capture flow's permanent home is inside
          the spot-create sequence (STOURIFY-5); until that lands, this is what
          makes the screens reachable at all — including for the live-run gate.
        */}
        <Card onPress={() => navigation.navigate('CameraCapture')} accessibilityLabel="Add photos">
          <Text variant="h2">Add photos</Text>
          <Text variant="caption" color="muted">
            Capture what the spot actually looks like — works with no signal
          </Text>
        </Card>

        <Card raised={false}>
          <Text variant="h2" color="muted">
            New Collection
          </Text>
          <Text variant="caption" color="muted">
            Bundle spots into a themed set — after the beta
          </Text>
        </Card>

        <Card raised={false}>
          <Text variant="h2" color="muted">
            New Trail
          </Text>
          <Text variant="caption" color="muted">
            Link spots into an itinerary — after the beta
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  )
}

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
          The temporary Add-photos entry point is gone: capture now lives inside
          the spot-create sequence, which is where STOURIFY-5 put it. Reaching
          the camera without a spot to attach to was only ever a way to make the
          screens reachable before publish existed, and it produced photos bound
          to nothing.
        */}

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

        {/*
          The way back to work you have already made (STOURIFY-118).

          A spot published with no signal is saved on the device and sent later,
          and that worked — but once the app was restarted, still offline, there
          was nothing anywhere that would show it to you. My spots was reachable
          only in the seconds after publishing, and Sync status sat behind the
          Profile screen, which fetches the profile and stops at an error wall
          with no network. So the one screen written to reassure somebody their
          unsent work is safe was behind the one screen that needs the network
          they do not have.

          This menu is the fix because of what it is NOT: it reads nothing from
          the server, it is one tap from anywhere in the app, and it is where the
          person was standing when they made the thing they are now looking for.
        */}
        <Text variant="micro" color="muted">
          Your work
        </Text>

        {/*
          Posts started and not shared (STOURIFY-159). It is here as well as on
          your own profile because this menu reads nothing from the server, so
          it opens with no signal — the same reasoning STOURIFY-118 used for
          the offline queue screen below.
        */}
        <Card onPress={() => navigation.navigate('Drafts')} accessibilityLabel="Drafts">
          <Text variant="h2">Drafts</Text>
          <Text variant="caption" color="muted">
            Posts you started and have not shared
          </Text>
        </Card>

        <Card onPress={() => navigation.navigate('MySpots')} accessibilityLabel="My spots">
          <Text variant="h2">My spots</Text>
          <Text variant="caption" color="muted">
            Everything you have added, including anything still waiting to upload
          </Text>
        </Card>

        <Card onPress={() => navigation.navigate('SyncStatus')} accessibilityLabel="Offline & sync">
          <Text variant="h2">Offline &amp; sync</Text>
          <Text variant="caption" color="muted">
            See what is waiting to be sent, and retry anything that did not go through
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  )
}

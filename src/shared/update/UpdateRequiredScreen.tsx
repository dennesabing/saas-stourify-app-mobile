import { Linking, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BuildIdentity, Button, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  /** Where a working build can be downloaded, or `null` if nowhere is known. */
  downloadUrl: string | null
  /** The release channel's own wording, when it published one. */
  message?: string | null
  /** The newest published version, so this screen can name it. */
  latestVersion?: string | null
}

/**
 * The note on the door of a shop that has moved.
 *
 * This replaces the entire app when the published release channel says this
 * build is older than the oldest one it still permits. Before it existed, a
 * stranded install simply failed every request in silence and looked broken
 * rather than out of date (STOURIFY-190).
 *
 * Three deliberate absences, each of which was the tempting thing to add:
 *
 * - **No dismiss control.** Letting somebody past leads into a session where
 *   nothing works, which is the state this screen exists to replace. A screen
 *   you can escape from is a warning; this has to be a wall.
 * - **No link to any Stourify server.** The link comes from the release
 *   manifest, which is a CDN address. Sending somebody to a page on the host
 *   they cannot reach would be the original bug repeated one level down.
 * - **No button at all when there is no link.** A button that does nothing when
 *   pressed reads as a broken app, which is the impression this whole feature
 *   is trying to correct.
 */
export default function UpdateRequiredScreen({ downloadUrl, message, latestVersion }: Props) {
  const theme = useTheme()

  return (
    <SafeAreaView
      testID="update-required"
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
    >
      <View
        style={{ flex: 1, justifyContent: 'center', padding: theme.gutter, gap: theme.spacing[6] }}
      >
        <View style={{ gap: theme.spacing[3] }}>
          <Text variant="h1">This version of Stourify is out of date</Text>

          {message ? (
            <Text variant="bodyLg" color="muted">
              {message}
            </Text>
          ) : (
            <Text testID="update-required-explanation" variant="bodyLg" color="muted">
              It can no longer connect to Stourify. Nothing is wrong with your account — this copy
              of the app is simply too old to work any more.
            </Text>
          )}

          {latestVersion ? (
            <Text variant="body" color="muted">
              The current version is {latestVersion}. Download it and install it over this one; your
              account and anything saved on this device stay as they are.
            </Text>
          ) : null}
        </View>

        {downloadUrl ? (
          <Button
            label="Download the latest version"
            testID="update-required-download"
            fullWidth
            onPress={() => {
              // A device with no handler for the link rejects here. An
              // unhandled rejection would crash the one screen somebody
              // stranded has left, so it is swallowed on purpose.
              Linking.openURL(downloadUrl).catch(() => {})
            }}
          />
        ) : null}
      </View>

      <BuildIdentity />
    </SafeAreaView>
  )
}

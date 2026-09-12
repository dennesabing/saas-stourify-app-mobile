import { useState } from 'react'
import { Linking, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getMyProfile } from '@/shared/api/profiles'
import * as authApi from '@/shared/api/auth'
import { PRIVACY_POLICY_URL, TERMS_URL, ACCOUNT_DELETION_URL } from '@/shared/config/legal'
import {
  Avatar,
  BarHeader,
  BuildIdentity,
  Button,
  Sheet,
  SheetOption,
  Text,
} from '@/shared/components/ui'
import { useAuthStore } from '@/shared/store/auth'
import { signOut } from '@/sync/session'
import { useSyncStatusStore } from '@/sync/status'
import { useAppearanceStore, type AppearanceChoice } from '@/theme/appearance'
import { useTheme } from '@/theme/ThemeProvider'
import { SettingsGroup, SettingsRow } from '../components/SettingsRows'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Settings'>

const APPEARANCE_OPTIONS: { key: AppearanceChoice; label: string; description: string }[] = [
  { key: 'system', label: 'System', description: 'Match your phone’s setting' },
  { key: 'light', label: 'Light', description: 'Always light' },
  { key: 'dark', label: 'Dark', description: 'Always dark' },
]

const APPEARANCE_LABELS: Record<AppearanceChoice, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

/**
 * What the Log out sheet says, and it has to be true (STOURIFY-214).
 *
 * The design's line — "Your offline downloads stay on this device" — says the
 * opposite of what happens: `signOut()` wipes this phone's copy of the account,
 * so changes that have not reached the server yet are deleted, and so are
 * drafts, which never leave the phone at all. The count comes from the sync
 * queue, the same numbers `signOut()` itself records before it wipes.
 */
function logoutCopy(unsent: number): string {
  if (unsent === 0) {
    return 'Everything you’ve shared has been sent. Logging out still clears this phone’s copy, including any drafts. You can log back in anytime.'
  }

  const changes = unsent === 1 ? '1 change' : `${unsent} changes`
  const verb = unsent === 1 ? 'hasn’t' : 'haven’t'
  const them = unsent === 1 ? 'it' : 'them'
  return `${changes} on this phone ${verb} been sent yet. Logging out deletes ${them} for good, along with any drafts.`
}

/**
 * Settings — the design's hub, artboard 1 of `docs/design/Stourify - Settings.dc.html`
 * (STOURIFY-290).
 *
 * It shows only what the app can actually do. The design also draws
 * Notifications, Language, subscriptions, offline map downloads, Help and
 * Contact support; nothing backs any of them yet, and a row that leads nowhere
 * is a promise the app breaks (STOURIFY-75). The card's spec names each one.
 *
 * The privacy switches and Delete account live one level down, on Privacy &
 * security, where the design's artboard 3 draws them.
 */
export default function SettingsScreen({ navigation }: Props) {
  const theme = useTheme()
  const currentUser = useAuthStore((state) => state.user)
  const appearance = useAppearanceStore((state) => state.choice)
  const chooseAppearance = useAppearanceStore((state) => state.choose)
  const unsent = useSyncStatusStore((state) => state.pendingCount + state.pendingMediaCount)

  const [choosingAppearance, setChoosingAppearance] = useState(false)
  const [showingLegal, setShowingLegal] = useState(false)
  const [confirmingLogout, setConfirmingLogout] = useState(false)

  /**
   * The caller's own profile, under the SAME key the profile screen uses, so
   * the two screens read one cached answer instead of two. It resolves to
   * `null` for somebody who registered and skipped onboarding; the account card
   * then falls back to the account's own name.
   */
  const { data: profile } = useQuery({
    queryKey: ['explorer-profile', 'me'],
    queryFn: getMyProfile,
  })

  const displayName = profile?.name ?? currentUser?.name ?? ''
  const handle = profile
    ? `@${profile.username}${profile.home_city ? ` · ${profile.home_city.name}` : ''}`
    : null

  const confirmLogout = async () => {
    setConfirmingLogout(false)
    try {
      await authApi.logout()
    } catch {}
    // signOut() already clears the token/user — no separate clearAuth() call.
    // This is the app's only user-facing logout affordance; it MUST go through
    // the same teardown as the 401 paths (client.ts, sync/httpClient.ts), or
    // the local database and sync cursor survive a real logout.
    await signOut()
  }

  // Opened in the device browser via Linking rather than an in-app WebView or
  // expo-web-browser. Both of those are native modules, so adding one would force
  // a rebuild of the dev client and of the APK to ship what is, on our side, three
  // links. Linking ships with React Native and needs neither.
  //
  // Failure is swallowed: openURL rejects when no browser can handle the intent,
  // and a settings row that throws an unhandled rejection is worse than one that
  // does nothing.
  const openLegalPage = (url: string) => {
    setShowingLegal(false)
    Linking.openURL(url).catch(() => {})
  }

  return (
    <View testID="settings-screen" style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <BarHeader title="Settings" onBack={() => navigation.goBack()} />

        {/*
          STOURIFY-181: the content scrolls, the header does not. Everything
          below once hung off a plain `View`, which CLIPS rather than scrolls —
          so on a 720x1280 phone the last rows could not be reached by any
          gesture. The way out of the screen stays put for the same reason.
        */}
        <ScrollView
          testID="settings-scroll"
          style={{ flex: 1 }}
          // Clears the tab bar sitting over the bottom of this stack: reaching
          // the last row is not the same as being able to read it.
          contentContainerStyle={{ paddingBottom: 48 }}
        >
          {/* The design's `.acct`. Not a button: the design wires it to
              nothing, and Edit profile is the next row down. */}
          <View
            testID="settings-account"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 13,
              marginHorizontal: theme.gutter,
              marginTop: 2,
              marginBottom: theme.spacing[2],
              padding: 14,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.hairline,
              borderRadius: 16,
            }}
          >
            <Avatar uri={currentUser?.avatar} name={displayName || profile?.username} size={56} />
            <View style={{ flex: 1 }}>
              {displayName ? (
                <Text
                  variant="h2"
                  numberOfLines={1}
                  style={{ fontFamily: theme.fontFamily.displayBold, fontSize: 17, lineHeight: 22 }}
                >
                  {displayName}
                </Text>
              ) : null}
              {handle ? (
                <Text
                  variant="caption"
                  color="muted"
                  numberOfLines={1}
                  style={{ fontFamily: theme.fontFamily.bodyRegular, fontSize: 12.5 }}
                >
                  {handle}
                </Text>
              ) : null}
            </View>
          </View>

          <SettingsGroup label="Account">
            <SettingsRow
              icon="account"
              label="Edit profile"
              onPress={() => navigation.navigate('EditProfile')}
            />
            <SettingsRow
              icon="lock"
              label="Privacy & security"
              onPress={() => navigation.navigate('PrivacySecurity')}
            />
          </SettingsGroup>

          <SettingsGroup label="Preferences">
            <SettingsRow
              icon="appearance"
              label="Appearance"
              value={APPEARANCE_LABELS[appearance]}
              onPress={() => setChoosingAppearance(true)}
            />
          </SettingsGroup>

          <SettingsGroup label="Offline">
            <SettingsRow
              icon="sync"
              label="Offline & sync"
              onPress={() => navigation.navigate('SyncStatus')}
            />
          </SettingsGroup>

          {/*
            Play requires the privacy policy and terms to be reachable from
            inside the app, plus a web-reachable account-deletion page as well as
            the in-app path on Privacy & security. The design draws one row here;
            the three pages sit one tap behind it.
          */}
          <SettingsGroup label="Legal">
            <SettingsRow
              icon="document"
              label="Terms & privacy policy"
              onPress={() => setShowingLegal(true)}
            />
          </SettingsGroup>

          <View style={{ marginTop: 14 }}>
            <SettingsGroup>
              <SettingsRow
                icon="logout"
                label="Log out"
                danger
                chevron={false}
                onPress={() => setConfirmingLogout(true)}
              />
            </SettingsGroup>
          </View>

          {/* Same line the signed-out screens carry, so the build-identity check in
              `.claude/docs/testing.md` also works on a device already signed in. */}
          <BuildIdentity style={{ marginTop: theme.spacing[5] }} />
        </ScrollView>
      </SafeAreaView>

      <Sheet
        visible={choosingAppearance}
        onClose={() => setChoosingAppearance(false)}
        title="Appearance"
      >
        {APPEARANCE_OPTIONS.map((option) => (
          <SheetOption
            key={option.key}
            label={option.label}
            description={option.description}
            selected={appearance === option.key}
            onPress={() => {
              setChoosingAppearance(false)
              void chooseAppearance(option.key)
            }}
          />
        ))}
      </Sheet>

      <Sheet
        visible={showingLegal}
        onClose={() => setShowingLegal(false)}
        title="Legal"
        subtitle="These open in your browser."
      >
        <SheetOption label="Terms of Service" onPress={() => openLegalPage(TERMS_URL)} />
        <SheetOption label="Privacy Policy" onPress={() => openLegalPage(PRIVACY_POLICY_URL)} />
        <SheetOption
          label="Request account deletion"
          description="The web form, for when you can’t sign in to the app."
          onPress={() => openLegalPage(ACCOUNT_DELETION_URL)}
        />
      </Sheet>

      <Sheet
        visible={confirmingLogout}
        onClose={() => setConfirmingLogout(false)}
        title="Log out of Stourify?"
      >
        <Text testID="logout-copy" variant="body" color="muted">
          {logoutCopy(unsent)}
        </Text>
        <Button
          testID="logout-confirm"
          label="Log out"
          variant="danger"
          size="lg"
          fullWidth
          onPress={() => void confirmLogout()}
        />
        <Button
          label="Stay logged in"
          variant="ghost"
          fullWidth
          onPress={() => setConfirmingLogout(false)}
        />
      </Sheet>
    </View>
  )
}

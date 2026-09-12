import { useState } from 'react'
import { KeyboardAvoidingView, Modal, ScrollView, Switch, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getMyProfile, updateMyProfile } from '@/shared/api/profiles'
import { getBlocks } from '@/shared/api/blocks'
import { deleteAccount, deletionOutcomeIsUnknown } from '@/shared/api/account'
import { BarHeader, Button, Input, Text } from '@/shared/components/ui'
import { signOut } from '@/sync/session'
import { useTheme } from '@/theme/ThemeProvider'
import { SettingsGroup, SettingsRow } from '../components/SettingsRows'
import { BLOCKS_QUERY_KEY } from '../queryKeys'

type Props = NativeStackScreenProps<ProfileStackParamList, 'PrivacySecurity'>

/**
 * Privacy & security — artboard 3 of `docs/design/Stourify - Settings.dc.html`
 * (STOURIFY-290).
 *
 * The controls here used to sit on the Settings hub, and each works exactly as
 * it did there: the same saves, the same rollbacks, the same messages. Only
 * where they live and what they look like changed.
 *
 * The design also draws Change password, Two-factor authentication and
 * Download my data. None of them exists in the app yet (Change password has a
 * server endpoint and no screen), so they are left out rather than drawn as
 * rows that do nothing; the card's spec says so.
 */
export default function PrivacySecurityScreen({ navigation }: Props) {
  const theme = useTheme()
  const qc = useQueryClient()

  // Account deletion is confirmed in a dialog rather than by an Alert, because
  // the server demands the account's own email and password and an Alert
  // cannot collect them. Keeping the credentials in the confirmation — instead
  // of reusing a stored session — is what makes a mis-tap survivable.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [privacyError, setPrivacyError] = useState<string | null>(null)
  // A second error slot rather than one shared with the row above. The two
  // switches sit one on top of the other, and a single message underneath both
  // of them cannot say which save failed -- which on a privacy control is the
  // whole point of showing a message at all.
  const [locationError, setLocationError] = useState<string | null>(null)

  /**
   * The caller's own profile, under the SAME key the profile screen uses.
   *
   * Sharing the key is the point rather than an economy: React Query files one
   * cached value per key, so toggling privacy here and then opening your own
   * profile shows one answer instead of two. A second key for the same fact is
   * how two screens come to disagree about whether you are private.
   *
   * It resolves to `null` — not an error — for somebody who registered and
   * skipped onboarding, which is why the rows below are disabled rather than
   * absent in that case.
   */
  const { data: profile } = useQuery({
    queryKey: ['explorer-profile', 'me'],
    queryFn: getMyProfile,
  })

  /**
   * Only for the count on the Blocked accounts row, under the key the list
   * itself uses. When it cannot be loaded the row simply shows no number and
   * still opens the list, which has its own failure panel.
   */
  const { data: blocks } = useQuery({ queryKey: BLOCKS_QUERY_KEY, queryFn: getBlocks })
  const blockedCount = blocks?.meta?.total

  const isPrivate = profile?.is_private ?? false
  /**
   * Defaults to ON, and the default is the load-bearing part.
   *
   * `sto_explorer_profiles.shows_location_on_spots` is a boolean column with a
   * database default of `true`, so an account that has never touched this
   * setting is sharing its spot coordinates. A switch that guessed `false` for
   * that account would say "hidden" over a server that is still handing the
   * position out -- the same broken promise this feature exists to remove, told
   * backwards.
   */
  const showsLocation = profile?.shows_location_on_spots ?? true
  const hasProfile = profile != null

  /**
   * One field per save. `PATCH /profile` is an upsert that also validates
   * `username`, so restating fields nobody touched would let an unrelated
   * uniqueness failure block a privacy change.
   *
   * **The switch moves first and is corrected afterwards** — the pattern React
   * Query calls an *optimistic update*. `onMutate` writes the new value into
   * the cache the switch reads, so the control follows your finger; `onError`
   * puts the old value back and says why; `onSettled` refetches so the server
   * always has the last word.
   *
   * Without that, the switch stays where it was for the whole round trip and
   * looks like it refused the tap. That is not a theory: on the live run for
   * STOURIFY-156 the save landed correctly in the database while the switch sat
   * in the old position for several seconds. On a privacy control specifically,
   * "looks like it ignored me" is the worst possible feedback — it invites a
   * second tap, which would toggle it straight back.
   *
   * `onError` is not optional either. A switch that keeps a value the server
   * refused tells somebody they are private when they are not.
   */
  const privacyMutation = useMutation({
    mutationFn: (next: boolean) => updateMyProfile({ is_private: next }),
    onMutate: async (next: boolean) => {
      setPrivacyError(null)
      // An in-flight read would otherwise land after this write and undo it.
      await qc.cancelQueries({ queryKey: ['explorer-profile', 'me'] })
      const previous = qc.getQueryData(['explorer-profile', 'me'])
      qc.setQueryData(['explorer-profile', 'me'], (old: unknown) =>
        old == null ? old : { ...(old as object), is_private: next },
      )
      return { previous }
    },
    onError: (_error, _next, context) => {
      qc.setQueryData(['explorer-profile', 'me'], context?.previous)
      setPrivacyError('That could not be saved. Your account is unchanged.')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['explorer-profile', 'me'] }),
  })

  /**
   * The same shape as `privacyMutation` above, pointed at a different field —
   * deliberately. Two privacy switches one above the other that behaved
   * differently would read as a fault in whichever was slower. So this one
   * writes optimistically, rolls back with its own message, and lets the server
   * have the last word, exactly like its neighbour.
   */
  const locationMutation = useMutation({
    mutationFn: (next: boolean) => updateMyProfile({ shows_location_on_spots: next }),
    onMutate: async (next: boolean) => {
      setLocationError(null)
      await qc.cancelQueries({ queryKey: ['explorer-profile', 'me'] })
      const previous = qc.getQueryData(['explorer-profile', 'me'])
      qc.setQueryData(['explorer-profile', 'me'], (old: unknown) =>
        old == null ? old : { ...(old as object), shows_location_on_spots: next },
      )
      return { previous }
    },
    onError: (_error, _next, context) => {
      qc.setQueryData(['explorer-profile', 'me'], context?.previous)
      setLocationError('That could not be saved. Your location setting is unchanged.')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['explorer-profile', 'me'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount(deleteEmail.trim(), deletePassword),
    onSuccess: async () => {
      setConfirmingDelete(false)
      // The server has already revoked every token, so the local database and
      // sync cursor are now orphaned state describing an account that no longer
      // exists. signOut() is the one path that clears all of it.
      await signOut(undefined, undefined, { trigger: 'account-closed' })
    },
    onError: async (error: any) => {
      // A timeout is not a rejection — see DELETION_TIMEOUT_NOTE in
      // `shared/api/account.ts`. With no response there is no way to know
      // whether the account survived, and the observed case was that it did
      // not: staying "signed in" then leaves a token the server has already
      // revoked, and every retry answers 401.
      if (deletionOutcomeIsUnknown(error)) {
        setConfirmingDelete(false)
        await signOut(undefined, undefined, { trigger: 'account-closed' })
        return
      }

      // A real rejection — wrong password, wrong email — means the account is
      // definitely still there, so stay signed in. Tearing the session down
      // here would present a refused deletion as a successful one.
      setDeleteError(
        error?.response?.data?.message ?? 'Could not delete your account. Please try again.',
      )
    },
  })

  const submitDelete = () => {
    setDeleteError(null)

    // Checked before the request rather than after: an empty field would come
    // back as a 422 that reads like a wrong password.
    if (deleteEmail.trim() === '' || deletePassword === '') {
      setDeleteError('Enter your email address and password to confirm.')
      return
    }

    deleteMutation.mutate()
  }

  const cancelDelete = () => {
    setConfirmingDelete(false)
    setDeleteError(null)
    setDeletePassword('')
  }

  // The design's toggle: azure when on. Off is drawn in the muted grey, which
  // stays visible on the card in both themes — the paler track the canvas
  // draws disappears against a dark card.
  const switchColours = {
    trackColor: { false: theme.colors.muted, true: theme.colors.primary },
    thumbColor: theme.colors.onButton,
  }

  const note = { paddingHorizontal: 20, paddingTop: theme.spacing[2] }

  return (
    <View testID="privacy-screen" style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <BarHeader title="Privacy & security" onBack={() => navigation.goBack()} />

        <ScrollView
          testID="privacy-scroll"
          style={{ flex: 1 }}
          // Clears the tab bar over the bottom of this stack (STOURIFY-181).
          contentContainerStyle={{ paddingBottom: 48 }}
        >
          <SettingsGroup label="Privacy">
            {/*
              The ONE privacy setting the server actually enforces. A private
              account turns a follow into a request you have to accept, and
              hides your follower and following lists from anyone who is not
              already following you (STOURIFY-156, specced as STOURIFY-57).
            */}
            <SettingsRow
              icon="private"
              label="Private account"
              right={
                <Switch
                  accessibilityLabel="Private account"
                  value={isPrivate}
                  disabled={!hasProfile || privacyMutation.isPending}
                  onValueChange={(next) => privacyMutation.mutate(next)}
                  {...switchColours}
                />
              }
            />
            {/*
              The switch that makes `shows_location_on_spots` mean something
              (STOURIFY-241, held back until STOURIFY-185, -187 and -240 closed
              the gaps). It is deliberately the ONLY control for this fact in the
              app: a second one would be two answers to one question.
            */}
            <SettingsRow
              icon="pin"
              label="Show location on spots"
              right={
                <Switch
                  accessibilityLabel="Show location on spots"
                  value={showsLocation}
                  disabled={!hasProfile || locationMutation.isPending}
                  onValueChange={(next) => locationMutation.mutate(next)}
                  {...switchColours}
                />
              }
            />
          </SettingsGroup>

          {!hasProfile && (
            <Text variant="caption" color="muted" style={note}>
              Set up your profile first to use this.
            </Text>
          )}

          {privacyError !== null && (
            <Text variant="caption" color="danger" style={note}>
              {privacyError}
            </Text>
          )}

          {/*
            Standing text, not a confirmation dialog: the sentence people most
            need — that it works from now on — is for somebody deciding whether
            to leave it ON, which is the default. The nearby sentence is a real
            cost: a spot that still answers "am I within 2 km of you?" has not
            hidden its position (STOURIFY-75, first ASSUMPTION note).
          */}
          <Text testID="location-privacy-copy" variant="caption" color="muted" style={note}>
            Turn this off and your spots stop showing where they are, and they drop out of nearby
            results — people can still find them in Discover, in search, on your profile, and from a
            direct link. It works from now on: a position already downloaded onto a phone cannot be
            called back.
          </Text>

          {locationError !== null && (
            <Text variant="caption" color="danger" style={note}>
              {locationError}
            </Text>
          )}

          {/*
            Blocked accounts is the only place a block can be lifted from. The
            obvious home — a toggle on the blocked person's profile — is
            unreachable once the block stands, because the server refuses that
            profile to the blocker as well (STOURIFY-36, STOURIFY-37).
          */}
          <SettingsGroup label="Blocked users">
            <SettingsRow
              icon="block"
              label="Blocked accounts"
              value={blockedCount != null ? String(blockedCount) : undefined}
              onPress={() => navigation.navigate('BlockedAccounts')}
            />
          </SettingsGroup>

          {/* Play requires the deletion path to exist IN the app (STOURIFY-32). */}
          <SettingsGroup label="Your data">
            <SettingsRow
              icon="trash"
              label="Delete account"
              danger
              onPress={() => setConfirmingDelete(true)}
            />
          </SettingsGroup>
        </ScrollView>
      </SafeAreaView>

      {/*
        Painted from the theme since STOURIFY-290: the theme's scrim behind a
        card-coloured dialog. It used to be dark whatever the phone said; the
        red button and "cannot be undone" carry the warning now, instead of a
        dark box inside a light app (see the card's ASSUMPTION note).
      */}
      <Modal
        visible={confirmingDelete}
        transparent
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        {/* STOURIFY-100: a modal has its own window, and under edge-to-edge nothing
            resizes it — without this the keyboard covers both confirmation fields. */}
        <KeyboardAvoidingView
          behavior="padding"
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: theme.spacing[6],
            backgroundColor: theme.colors.scrim,
          }}
        >
          <View
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.card,
              padding: theme.spacing[5],
              gap: theme.spacing[3],
              ...theme.elevation.floating,
            }}
          >
            <Text variant="h2">Delete your account?</Text>
            <Text variant="body" color="muted">
              Your spots, posts, reviews, wishlist and follows are removed. This cannot be undone
              from the app. Enter your email address and password to confirm.
            </Text>

            {/*
              Built from the shared `Input`, and that is the whole of
              STOURIFY-164: the Show / Hide toggle STOURIFY-99 added lives INSIDE
              that component, so every field built from it gets the toggle. The
              `label` gives each field a name a screen reader can announce once
              the placeholder is gone.
            */}
            <Input
              label="Email"
              placeholder="Your email address"
              autoCapitalize="none"
              keyboardType="email-address"
              value={deleteEmail}
              onChangeText={setDeleteEmail}
            />
            <Input
              label="Password"
              placeholder="Your password"
              autoCapitalize="none"
              secureTextEntry
              value={deletePassword}
              onChangeText={setDeletePassword}
            />

            {deleteError !== null && (
              <Text variant="caption" color="danger">
                {deleteError}
              </Text>
            )}

            <Button
              label={deleteMutation.isPending ? 'Deleting…' : 'Delete my account'}
              variant="danger"
              fullWidth
              disabled={deleteMutation.isPending}
              onPress={submitDelete}
            />
            <Button label="Cancel" variant="ghost" fullWidth onPress={cancelDelete} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

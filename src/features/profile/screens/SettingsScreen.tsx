import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Linking,
  KeyboardAvoidingView,
  Switch,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getMyProfile, updateMyProfile } from '@/shared/api/profiles'
import * as authApi from '@/shared/api/auth'
import { deleteAccount, deletionOutcomeIsUnknown } from '@/shared/api/account'
import { signOut } from '@/sync/session'
import { PRIVACY_POLICY_URL, TERMS_URL, ACCOUNT_DELETION_URL } from '@/shared/config/legal'
import BuildIdentity from '@/shared/components/ui/BuildIdentity'
import Input from '@/shared/components/ui/Input'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Settings'>

export default function SettingsScreen({ navigation }: Props) {
  const qc = useQueryClient()

  // Account deletion is confirmed in a sheet rather than by an Alert, because
  // the server demands the account's own email and password and an Alert
  // cannot collect them. Keeping the credentials in the confirmation — instead
  // of reusing a stored session — is what makes a mis-tap survivable.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [privacyError, setPrivacyError] = useState<string | null>(null)

  /**
   * The caller's own profile, under the SAME key the profile screen uses.
   *
   * Sharing the key is the point rather than an economy: React Query files one
   * cached value per key, so toggling privacy here and then opening your own
   * profile shows one answer instead of two. A second key for the same fact is
   * how two screens come to disagree about whether you are private.
   *
   * It resolves to `null` — not an error — for somebody who registered and
   * skipped onboarding, which is why the row below is disabled rather than
   * absent in that case.
   */
  const { data: profile } = useQuery({
    queryKey: ['explorer-profile', 'me'],
    queryFn: getMyProfile,
  })

  const isPrivate = profile?.is_private ?? false
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
   * `onError` is not optional either. The two rows this replaces had no error
   * handling at all, which is a large part of why every one of their requests
   * could 404 for months without anybody noticing — and a switch that keeps a
   * value the server refused tells somebody they are private when they are not.
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

  const handleLogout = async () => {
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
    Linking.openURL(url).catch(() => {})
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount(deleteEmail.trim(), deletePassword),
    onSuccess: async () => {
      setConfirmingDelete(false)
      // The server has already revoked every token, so the local database and
      // sync cursor are now orphaned state describing an account that no longer
      // exists. signOut() is the one path that clears all of it.
      await signOut()
    },
    onError: async (error: any) => {
      // A timeout is not a rejection — see DELETION_TIMEOUT_NOTE in
      // `shared/api/account.ts`. With no response there is no way to know
      // whether the account survived, and the observed case was that it did
      // not: staying "signed in" then leaves a token the server has already
      // revoked, and every retry answers 401.
      if (deletionOutcomeIsUnknown(error)) {
        setConfirmingDelete(false)
        await signOut()
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/*
        Blocked accounts is the only place a block can be lifted from. The
        obvious home — a toggle on the blocked person's profile — is unreachable
        once the block stands, because the server refuses that profile to the
        blocker as well, so the difference in responses cannot announce the block
        (STOURIFY-36, STOURIFY-37).
      */}
      <Text style={styles.section}>PRIVACY</Text>

      {/*
        The ONE privacy setting the server actually enforces. A private account
        turns a follow into a request you have to accept, and hides your
        follower and following lists from anyone who is not already following
        you — one switch, both consequences, which is why there is no separate
        "follow mode".

        This row replaces two that read and wrote `/settings/account`, a route
        that has never existed (STOURIFY-156, specced as STOURIFY-57). They
        showed `–` forever and every tap 404'd in silence.
      */}
      <View style={styles.row}>
        <Text style={styles.rowIcon}>🔐</Text>
        <Text style={styles.rowLabel}>Private account</Text>
        <Switch
          accessibilityLabel="Private account"
          value={isPrivate}
          disabled={!hasProfile || privacyMutation.isPending}
          onValueChange={(next) => privacyMutation.mutate(next)}
        />
      </View>

      {!hasProfile && <Text style={styles.rowHint}>Set up your profile first to use this.</Text>}

      {privacyError !== null && <Text style={styles.rowError}>{privacyError}</Text>}

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('BlockedAccounts')}>
        <Text style={styles.rowIcon}>🚫</Text>
        <Text style={styles.rowLabel}>Blocked accounts</Text>
        <Text style={styles.rowValue}>›</Text>
      </TouchableOpacity>

      <Text style={styles.section}>OFFLINE</Text>

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('SyncStatus')}>
        <Text style={styles.rowIcon}>🔄</Text>
        <Text style={styles.rowLabel}>Offline & sync</Text>
        <Text style={styles.rowValue}>›</Text>
      </TouchableOpacity>

      {/*
        Play requires the privacy policy and terms to be reachable from inside the
        app, not only from the store listing, and requires a web-reachable
        account-deletion page in addition to the in-app path below. These sit
        outside DANGER ZONE deliberately: reading a policy is not destructive, and
        the only irreversible action on this screen should be the one in the red
        section.
      */}
      <Text style={styles.section}>LEGAL</Text>

      <TouchableOpacity style={styles.row} onPress={() => openLegalPage(PRIVACY_POLICY_URL)}>
        <Text style={styles.rowIcon}>🔒</Text>
        <Text style={styles.rowLabel}>Privacy Policy</Text>
        <Text style={styles.rowValue}>↗</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={() => openLegalPage(TERMS_URL)}>
        <Text style={styles.rowIcon}>📄</Text>
        <Text style={styles.rowLabel}>Terms of Service</Text>
        <Text style={styles.rowValue}>↗</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={() => openLegalPage(ACCOUNT_DELETION_URL)}>
        <Text style={styles.rowIcon}>❓</Text>
        <Text style={styles.rowLabel}>Request account deletion</Text>
        <Text style={styles.rowValue}>↗</Text>
      </TouchableOpacity>

      <Text style={styles.section}>DANGER ZONE</Text>

      <TouchableOpacity style={styles.row} onPress={handleLogout}>
        <Text style={styles.rowIcon}>🚪</Text>
        <Text style={[styles.rowLabel, { color: '#ff6b6b' }]}>Logout</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={() => setConfirmingDelete(true)}>
        <Text style={styles.rowIcon}>🗑</Text>
        <Text style={[styles.rowLabel, { color: '#ff6b6b' }]}>Delete account</Text>
      </TouchableOpacity>

      {/* Same line the signed-out screens carry, so the build-identity check in
          `.claude/docs/testing.md` also works on a device already signed in. */}
      <BuildIdentity color="#8496a6" />

      <Modal
        visible={confirmingDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmingDelete(false)}
      >
        {/* STOURIFY-100: a modal has its own window, and under edge-to-edge nothing
            resizes it — without this the keyboard covers both confirmation fields. */}
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior="padding">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalBody}>
              Your spots, posts, reviews, wishlist and follows are removed. This cannot be undone
              from the app. Enter your email address and password to confirm.
            </Text>

            {/*
              Built from the shared `Input` rather than from a raw TextInput,
              and that is the whole of STOURIFY-164. The Show / Hide toggle
              STOURIFY-99 added lives INSIDE that component, so every field
              built from it got the toggle for free and this one — hand-rolled
              here with its own styles — silently did not. The same will be
              true of the next shared improvement unless the field is part of
              the set, which is the argument on STOURIFY-67 for not keeping a
              private copy of a shared decision.

              These two also had no accessible name at all: the only text on
              either was the placeholder, and a placeholder is gone the moment
              you type. `label` fixes that as well as captioning the field.

              Known and accepted: `Input` follows the theme and this dialog
              does not — it is painted dark whatever the system says, like the
              other seventeen colour literals on this screen. In dark mode the
              fields look as they always did; in light mode they are light on a
              dark card. Theming the rest of the screen is its own card.
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

            {deleteError !== null && <Text style={styles.modalError}>{deleteError}</Text>}

            <TouchableOpacity
              style={styles.destructiveButton}
              onPress={submitDelete}
              disabled={deleteMutation.isPending}
            >
              <Text style={styles.destructiveButtonLabel}>
                {deleteMutation.isPending ? 'Deleting…' : 'Delete my account'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setConfirmingDelete(false)
                setDeleteError(null)
                setDeletePassword('')
              }}
            >
              <Text style={styles.cancelButtonLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923', paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  back: { color: '#00b4d8' },
  title: { color: '#fff', fontWeight: '700', fontSize: 20 },
  section: { color: '#888', fontSize: 11, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  rowIcon: { fontSize: 18 },
  rowLabel: { flex: 1, color: '#fff', fontSize: 15 },
  rowValue: { color: '#aaa', fontSize: 14 },
  rowHint: { color: '#888', fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  rowError: { color: '#ff6b6b', fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: '#16232f', borderRadius: 14, padding: 20, gap: 12 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalBody: { color: '#b9c4cf', fontSize: 14, lineHeight: 20 },
  modalError: { color: '#ff6b6b', fontSize: 13 },
  destructiveButton: {
    backgroundColor: '#c0392b',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  destructiveButtonLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelButton: { paddingVertical: 10, alignItems: 'center' },
  cancelButtonLabel: { color: '#9fb0c0', fontSize: 15 },
})

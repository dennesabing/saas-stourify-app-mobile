import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet } from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getAccountSettings, updateAccountSettings } from '@/shared/api/settings'
import * as authApi from '@/shared/api/auth'
import { deleteAccount, deletionOutcomeIsUnknown } from '@/shared/api/account'
import { signOut } from '@/sync/session'

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

  const { data: settings } = useQuery({
    queryKey: ['account-settings'],
    queryFn: getAccountSettings,
  })

  const updateMutation = useMutation({
    mutationFn: updateAccountSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account-settings'] }),
  })

  const handleLogout = async () => {
    try { await authApi.logout() } catch {}
    // signOut() already clears the token/user — no separate clearAuth() call.
    // This is the app's only user-facing logout affordance; it MUST go through
    // the same teardown as the 401 paths (client.ts, sync/httpClient.ts), or
    // the local database and sync cursor survive a real logout.
    await signOut()
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
        error?.response?.data?.message ?? 'Could not delete your account. Please try again.'
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

      <Text style={styles.section}>ACCOUNT</Text>

      <TouchableOpacity
        style={styles.row}
        onPress={() => updateMutation.mutate({
          account_visibility: settings?.account_visibility === 'public'
            ? 'followers_only'
            : settings?.account_visibility === 'followers_only'
            ? 'private'
            : 'public',
        })}
        disabled={updateMutation.isPending}
      >
        <Text style={styles.rowIcon}>👁</Text>
        <Text style={styles.rowLabel}>Account Visibility</Text>
        <Text style={styles.rowValue}>{settings?.account_visibility ?? '–'} ›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.row}
        onPress={() => updateMutation.mutate({
          follow_mode: settings?.follow_mode === 'open' ? 'approval_required' : 'open',
        })}
        disabled={updateMutation.isPending}
      >
        <Text style={styles.rowIcon}>🤝</Text>
        <Text style={styles.rowLabel}>Follow Mode</Text>
        <Text style={styles.rowValue}>{settings?.follow_mode ?? '–'} ›</Text>
      </TouchableOpacity>

      <Text style={styles.section}>OFFLINE</Text>

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('SyncStatus')}>
        <Text style={styles.rowIcon}>🔄</Text>
        <Text style={styles.rowLabel}>Offline & sync</Text>
        <Text style={styles.rowValue}>›</Text>
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

      <Modal
        visible={confirmingDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmingDelete(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalBody}>
              Your spots, posts, reviews, wishlist and follows are removed. This cannot be undone
              from the app. Enter your email address and password to confirm.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Your email address"
              placeholderTextColor="#7a8794"
              autoCapitalize="none"
              keyboardType="email-address"
              value={deleteEmail}
              onChangeText={setDeleteEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Your password"
              placeholderTextColor="#7a8794"
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
        </View>
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
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 12 },
  rowIcon: { fontSize: 18 },
  rowLabel: { flex: 1, color: '#fff', fontSize: 15 },
  rowValue: { color: '#aaa', fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#16232f', borderRadius: 14, padding: 20, gap: 12 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalBody: { color: '#b9c4cf', fontSize: 14, lineHeight: 20 },
  modalError: { color: '#ff6b6b', fontSize: 13 },
  input: {
    backgroundColor: '#0f1923',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  destructiveButton: { backgroundColor: '#c0392b', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  destructiveButtonLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelButton: { paddingVertical: 10, alignItems: 'center' },
  cancelButtonLabel: { color: '#9fb0c0', fontSize: 15 },
})

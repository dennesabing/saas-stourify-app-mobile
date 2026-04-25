import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getAccountSettings, updateAccountSettings } from '@/shared/api/settings'
import { useAuthStore } from '@/shared/store/auth'
import * as authApi from '@/shared/api/auth'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Settings'>

export default function SettingsScreen({ navigation }: Props) {
  const { clearAuth } = useAuthStore()
  const qc = useQueryClient()

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
    clearAuth()
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

      <Text style={styles.section}>DANGER ZONE</Text>

      <TouchableOpacity style={styles.row} onPress={handleLogout}>
        <Text style={styles.rowIcon}>🚪</Text>
        <Text style={[styles.rowLabel, { color: '#ff6b6b' }]}>Logout</Text>
      </TouchableOpacity>
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
})

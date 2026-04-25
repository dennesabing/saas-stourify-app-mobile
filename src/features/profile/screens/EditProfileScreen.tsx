import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { updateProfile } from '@/shared/api/users'
import { useAuthStore } from '@/shared/store/auth'
import { extractApiError } from '@/shared/api/client'

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>

export default function EditProfileScreen({ navigation }: Props) {
  const { user, setUser } = useAuthStore()
  const [name, setName] = useState(user?.name ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => updateProfile({ name, bio }),
    onSuccess: (updated) => {
      setUser(updated)
      qc.invalidateQueries({ queryKey: ['user', user?.uuid] })
      navigation.goBack()
    },
    onError: (err) => setError(extractApiError(err)),
  })

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
        <TouchableOpacity onPress={() => mutation.mutate()} disabled={mutation.isPending}>
          <Text style={styles.save}>Save</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{(name.charAt(0) || '?').toUpperCase()}</Text>
        </View>
        <Text style={styles.changePhoto}>Change Photo</Text>
      </View>

      <Text style={styles.label}>NAME</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholderTextColor="#666"
        placeholder="Your name"
      />

      <Text style={styles.label}>BIO</Text>
      <TextInput
        style={[styles.input, styles.bioInput]}
        value={bio}
        onChangeText={setBio}
        multiline
        placeholder="Write something about yourself..."
        placeholderTextColor="#666"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.btn} onPress={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnText}>Save Changes</Text>
        }
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923', paddingTop: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  cancel: { color: '#aaa', fontSize: 20 },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  save: { color: '#00b4d8', fontWeight: '700' },
  avatarWrap: { alignItems: 'center', padding: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#00b4d8', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  initials: { color: '#fff', fontWeight: '700', fontSize: 28 },
  changePhoto: { color: '#00b4d8', fontSize: 14 },
  label: { color: '#aaa', fontSize: 11, paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, color: '#fff', marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  bioInput: { height: 80, textAlignVertical: 'top' },
  error: { color: '#ff6b6b', paddingHorizontal: 16 },
  btn: { margin: 16, backgroundColor: '#00b4d8', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})

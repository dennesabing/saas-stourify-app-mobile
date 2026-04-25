import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, ScrollView, ActivityIndicator,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { createPost } from '@/shared/api/posts'
import { extractApiError } from '@/shared/api/client'
import { useUIStore } from '@/shared/store'

type Props = NativeStackScreenProps<CreateStackParamList, 'PostCompose'>
type Visibility = 'public' | 'followers' | 'private'

const VISIBILITY_OPTIONS: { label: string; value: Visibility }[] = [
  { label: '🌍 Public', value: 'public' },
  { label: '👥 Followers', value: 'followers' },
  { label: '🔒 Private', value: 'private' },
]

export default function PostComposeScreen({ route, navigation }: Props) {
  const { mediaAssets } = route.params
  const [caption, setCaption] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [error, setError] = useState('')
  const qc = useQueryClient()
  const { pendingSpot, setPendingSpot } = useUIStore()

  useEffect(() => {
    return () => { setPendingSpot(null) }
  }, [setPendingSpot])

  const createMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      if (caption) form.append('caption', caption)
      form.append('visibility', visibility)
      mediaAssets.forEach((asset, i) => {
        form.append(`media[${i}]`, {
          uri: asset.uri,
          type: asset.type ?? 'image/jpeg',
          name: asset.fileName ?? `photo_${i}.jpg`,
        } as unknown as Blob)
      })
      if (pendingSpot) {
        form.append('spot_name', pendingSpot.name)
        form.append('spot_latitude', String(pendingSpot.latitude))
        form.append('spot_longitude', String(pendingSpot.longitude))
      }
      return createPost(form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed', 'following'] })
      navigation.popToTop()
    },
    onError: (err) => setError(extractApiError(err)),
  })

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Post</Text>
        <TouchableOpacity onPress={() => createMutation.mutate()} disabled={createMutation.isPending}>
          <Text style={styles.share}>Share</Text>
        </TouchableOpacity>
      </View>

      {mediaAssets[0] && (
        <Image source={{ uri: mediaAssets[0].uri }} style={styles.preview} resizeMode="cover" />
      )}

      <TextInput
        style={styles.caption}
        placeholder="Write a caption..."
        placeholderTextColor="#666"
        value={caption}
        onChangeText={setCaption}
        multiline
      />

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('SpotPicker')}>
        <Text style={styles.rowIcon}>📍</Text>
        <Text style={styles.rowLabel}>Tag a Spot</Text>
        <Text style={styles.rowValue}>{pendingSpot?.name ?? 'None ›'}</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Visibility</Text>
      <View style={styles.visibilityRow}>
        {VISIBILITY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.visOpt, visibility === opt.value && styles.visOptActive]}
            onPress={() => setVisibility(opt.value)}
          >
            <Text style={[styles.visText, visibility === opt.value && styles.visTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={styles.shareBtn}
        onPress={() => createMutation.mutate()}
        disabled={createMutation.isPending}
      >
        {createMutation.isPending
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.shareBtnText}>Share Post</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 48 },
  back: { color: '#aaa' },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  share: { color: '#00b4d8', fontWeight: '700' },
  preview: { width: '100%', height: 200 },
  caption: { color: '#fff', padding: 16, fontSize: 15, minHeight: 80, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', gap: 8 },
  rowIcon: { fontSize: 18 },
  rowLabel: { flex: 1, color: '#fff', fontSize: 15 },
  rowValue: { color: '#00b4d8', fontSize: 14 },
  sectionLabel: { color: '#aaa', fontSize: 12, padding: 16, paddingBottom: 8 },
  visibilityRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  visOpt: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  visOptActive: { backgroundColor: '#00b4d8' },
  visText: { color: '#aaa', fontSize: 12 },
  visTextActive: { color: '#fff', fontWeight: '600' },
  error: { color: '#ff6b6b', padding: 16 },
  shareBtn: { margin: 16, backgroundColor: '#00b4d8', borderRadius: 12, padding: 16, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})

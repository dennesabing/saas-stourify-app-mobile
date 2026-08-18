import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, ScrollView, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { createPost, publishPost, type CreatePostInput } from '@/shared/api/posts'
import { uploadPostMedia } from '@/features/social/api/uploadPostMedia'
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
  // A new post starts locked, not shared (STOURIFY-105). The picker used to
  // open on Public, so an author who never looked at it published to everyone
  // by accident. Public and Followers are still one tap away.
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [error, setError] = useState('')
  const qc = useQueryClient()
  const { pendingSpot, setPendingSpot } = useUIStore()

  useEffect(() => {
    return () => { setPendingSpot(null) }
  }, [setPendingSpot])

  const createMutation = useMutation({
    /**
     * Create unpublished, upload, then publish — the contract the server
     * already documents (`PostStoreRequest`) and routes (`POST
     * /posts/{uuid}/publish`), in that order.
     *
     * This screen used to POST one multipart request carrying `media[0…n]` and
     * no `publish`. `PostStoreRequest` validates neither key and Laravel drops
     * unvalidated input silently, so every composed post was created with no
     * photos and left permanently unpublished — no error anywhere (STOURIFY-18).
     *
     * The publish is last on purpose: if a photo fails to upload the post stays
     * a draft rather than going live incomplete, and `publish` is idempotent, so
     * finishing it later is safe.
     */
    mutationFn: async () => {
      const payload: CreatePostInput = { visibility, publish: false }
      if (caption) payload.caption = caption
      // `spot_uuid` is the only spot field `PostStoreRequest` accepts. This
      // sent `spot_name` / `spot_latitude` / `spot_longitude` until 2026-08-11
      // (STOURIFY-2), and the association was thrown away every time.
      // `pendingSpot` is a `Spot` fetched from the server, so its uuid is
      // always in hand.
      if (pendingSpot) payload.spot_uuid = pendingSpot.uuid

      const post = await createPost(payload)
      await uploadPostMedia(post.uuid, mediaAssets)

      return publishPost(post.uuid)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed', 'following'] })
      navigation.popToTop()
    },
    onError: (err) => setError(extractApiError(err)),
  })

  // STOURIFY-100: edge-to-edge means Android no longer shrinks the window when the
  // keyboard opens, so the caption box has to be lifted clear of it here.
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
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
          <Text style={styles.rowValue}>{pendingSpot?.title ?? 'None ›'}</Text>
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
    </KeyboardAvoidingView>
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

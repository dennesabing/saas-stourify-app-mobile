import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Alert,
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, ScrollView, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native'
import axios from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { createPost, publishPost, type CreatePostInput } from '@/shared/api/posts'
import { uploadPostMedia } from '@/features/social/api/uploadPostMedia'
import { extractApiError } from '@/shared/api/client'
import { useUIStore } from '@/shared/store'
import { useDebounce } from '@/shared/hooks/useDebounce'
import {
  deleteDraft,
  findDraft,
  isWorthSaving,
  saveDraft,
  type DraftContent,
} from '@/features/social/api/postDrafts'
import { queuePost } from '@/features/social/api/postOutbox'

type Props = NativeStackScreenProps<CreateStackParamList, 'PostCompose'>
type Visibility = 'public' | 'followers' | 'private'

/** How long after the last keystroke the draft is written down. */
const DRAFT_SAVE_DELAY_MS = 800

/**
 * Did the request reach a server at all? (STOURIFY-161)
 *
 * A response-less axios error is axios's own definition of "this never
 * arrived" — a timeout, a DNS failure, a dropped radio — and it is the same
 * test `sync/mediaDrain.ts` and `sync/postOutboxDrain.ts` use.
 *
 * The app also keeps an online/offline flag, and this deliberately does not ask
 * it: STOURIFY-134 is an open bug where that flag can stay stuck at offline
 * after a real reconnect, which would queue a post somebody could have sent.
 * One doomed request in a tunnel is a cheap price for deciding on what actually
 * happened.
 */
function isDroppedRequest(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response === undefined
}

const VISIBILITY_OPTIONS: { label: string; value: Visibility }[] = [
  { label: '🌍 Public', value: 'public' },
  { label: '👥 Followers', value: 'followers' },
  { label: '🔒 Private', value: 'private' },
]

export default function PostComposeScreen({ route, navigation }: Props) {
  const [mediaAssets, setMediaAssets] = useState(route.params.mediaAssets ?? [])
  const [caption, setCaption] = useState('')
  // A new post starts locked, not shared (STOURIFY-105). The picker used to
  // open on Public, so an author who never looked at it published to everyone
  // by accident. Public and Followers are still one tap away.
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [error, setError] = useState('')
  const qc = useQueryClient()
  const database = useDatabase()
  const { pendingSpot, setPendingSpot } = useUIStore()

  /**
   * The draft this screen is writing into (STOURIFY-159).
   *
   * It is `null` until the author does something worth keeping, and from then
   * on every later save lands on the same row instead of leaving a copy behind.
   * Arriving from the Drafts page sets it up front.
   */
  const [draftId, setDraftId] = useState<string | null>(route.params.draftId ?? null)

  /**
   * The spot a restored draft was tagged with.
   *
   * A draft keeps the spot's uuid and its name, not the whole spot — the
   * Drafts page has to name it with no network, and the spot may not be in the
   * local database at all. A spot picked in THIS session (`pendingSpot`) is a
   * full record and always wins over this.
   */
  const [draftSpot, setDraftSpot] = useState<{ uuid: string; title: string } | null>(null)

  const taggedSpot = pendingSpot
    ? { uuid: pendingSpot.uuid, title: pendingSpot.title }
    : draftSpot

  useEffect(() => {
    return () => { setPendingSpot(null) }
  }, [setPendingSpot])

  // Opened from the Drafts page: put the author back where they were.
  useEffect(() => {
    const id = route.params.draftId
    if (id == null) return

    let cancelled = false
    void (async () => {
      const draft = await findDraft(database, id)
      if (draft === null || cancelled) return

      setCaption(draft.caption)
      setVisibility(draft.visibility as Visibility)
      setMediaAssets(draft.media)
      setDraftSpot(
        draft.spotUuid !== null
          ? { uuid: draft.spotUuid, title: draft.spotTitle ?? 'Tagged spot' }
          : null,
      )
    })()

    return () => { cancelled = true }
  }, [database, route.params.draftId])

  const content: DraftContent = {
    caption,
    visibility,
    spotUuid: taggedSpot?.uuid ?? null,
    spotTitle: taggedSpot?.title ?? null,
    media: mediaAssets,
  }

  /**
   * What was last written down, as text.
   *
   * Two saves of identical content are a wasted write and, worse, they move
   * the draft to the top of the Drafts page for having been *opened*. Comparing
   * against this is how re-opening a draft and changing nothing leaves it
   * exactly where it was.
   */
  const savedRef = useRef<string | null>(null)

  /** Everything the unmount save needs, kept current without re-subscribing. */
  const stateRef = useRef({ content, draftId, published: false })

  /**
   * The uuid the server handed back, if it got as far as answering.
   *
   * Publishing is three steps and the signal can die between any two of them.
   * If the post was already created before it died, the queue entry has to
   * carry that id or the next attempt makes a second post.
   */
  const createdUuidRef = useRef<string | null>(null)
  stateRef.current.content = content
  stateRef.current.draftId = draftId

  const persist = useCallback(async (): Promise<void> => {
    const { content: current, draftId: id, published } = stateRef.current
    if (published) return
    if (!isWorthSaving(current)) return

    const serialised = JSON.stringify(current)
    if (serialised === savedRef.current) return

    const savedId = await saveDraft(database, current, id)
    savedRef.current = serialised
    stateRef.current.draftId = savedId
    setDraftId(savedId)
  }, [database])

  // Shortly after the typing stops. Every keystroke would write to the database
  // dozens of times a sentence for no benefit; only-on-leaving loses everything
  // to a crash. Both together cost at most the last second of typing.
  const debouncedCaption = useDebounce(caption, DRAFT_SAVE_DELAY_MS)
  useEffect(() => {
    void persist()
  }, [persist, debouncedCaption, visibility, taggedSpot?.uuid])

  // And once more on the way out, for the part the debounce had not reached.
  useEffect(() => {
    return () => { void persist() }
  }, [persist])

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
      // Cleared per attempt: a retry that gets further than the last one must
      // not inherit a uuid from a post the server never made.
      createdUuidRef.current = null

      const payload: CreatePostInput = { visibility, publish: false }
      if (caption) payload.caption = caption
      // `spot_uuid` is the only spot field `PostStoreRequest` accepts. This
      // sent `spot_name` / `spot_latitude` / `spot_longitude` until 2026-08-11
      // (STOURIFY-2), and the association was thrown away every time.
      // `pendingSpot` is a `Spot` fetched from the server, so its uuid is
      // always in hand.
      if (taggedSpot) payload.spot_uuid = taggedSpot.uuid

      const post = await createPost(payload)
      createdUuidRef.current = post.uuid
      await uploadPostMedia(post.uuid, mediaAssets)

      return publishPost(post.uuid)
    },
    /**
     * The draft is thrown away here and nowhere earlier.
     *
     * Publishing is three steps — create the post, upload the photos, publish
     * it — and any of them can fail. A draft deleted before the last one
     * succeeds would take the author's work with it at exactly the moment the
     * work could not be sent.
     */
    onSuccess: async () => {
      stateRef.current.published = true
      const id = stateRef.current.draftId
      if (id !== null) await deleteDraft(database, id)

      qc.invalidateQueries({ queryKey: ['feed', 'following'] })
      navigation.popToTop()
    },
    /**
     * Two failures that look alike and are not (STOURIFY-161).
     *
     * **The request never reached a server** — a tunnel, a lift, aeroplane
     * mode. Nothing is wrong with the post, so it goes in the send-later queue
     * and the author is told it will go out by itself. This is where the draft
     * stops being a draft: one post lives in one place, or it gets shared
     * twice.
     *
     * **The server answered and refused it** — too long, not allowed, a fault.
     * Queueing would only repeat the refusal later and out of sight, so this
     * behaves exactly as it did before this card: show what the server said and
     * leave the draft where it is.
     */
    onError: (err) => {
      if (!isDroppedRequest(err)) {
        setError(extractApiError(err))
        return
      }

      void (async () => {
        const { content: current, draftId: id } = stateRef.current
        // Set BEFORE the queue write, so the unmount save cannot race it and
        // write the draft back after the queue has taken it over.
        stateRef.current.published = true

        await queuePost(database, current, {
          draftId: id,
          postUuid: createdUuidRef.current,
        })

        Alert.alert(
          'No signal — this will send itself',
          'Your post is saved on this device and goes out on its own as soon as you are back online. You can see it waiting under Offline & sync.',
        )
        navigation.popToTop()
      })()
    },
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
          <Text style={styles.rowValue}>{taggedSpot?.title ?? 'None ›'}</Text>
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

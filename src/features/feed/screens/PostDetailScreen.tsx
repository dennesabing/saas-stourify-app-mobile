import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, Dimensions, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { FeedStackParamList } from '@/shared/navigation/types'
import { getPost, toggleLike } from '@/shared/api/posts'
import { getComments, createComment } from '@/shared/api/comments'
import { useAuthStore } from '@/shared/store/auth'
import type { Comment } from '@/shared/api/types'

const { width } = Dimensions.get('window')

type Props = NativeStackScreenProps<FeedStackParamList, 'PostDetail'>

export default function PostDetailScreen({ route, navigation }: Props) {
  const { postId } = route.params
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [commentText, setCommentText] = useState('')

  const { data: post } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => getPost(postId),
  })

  const { data: commentsData } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => getComments(postId),
  })

  const likeMutation = useMutation({
    mutationFn: () => toggleLike(postId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['post', postId] }),
  })

  const commentMutation = useMutation({
    mutationFn: (text: string) => createComment(postId, text),
    onSuccess: () => {
      setCommentText('')
      qc.invalidateQueries({ queryKey: ['comments', postId] })
    },
  })

  const comments = commentsData?.data ?? []
  const userInitials = post?.user?.name
    ? post.user.name.split(' ').map((n) => n[0] ?? '').join('').toUpperCase() || '?'
    : '?'

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <ScrollView>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {post?.media?.[0] && (
            <Image source={{ uri: post.media[0].url }} style={styles.media} resizeMode="cover" />
          )}

          {post?.spot && (
            <TouchableOpacity style={styles.spotChip}>
              <Text style={styles.spotChipText}>📍 {post.spot.name}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.initials}>{userInitials}</Text>
            </View>
            <Text style={styles.userName}>{post?.user?.name ?? 'Unknown'}</Text>
            <TouchableOpacity style={styles.likeBtn} onPress={() => likeMutation.mutate()} disabled={likeMutation.isPending}>
              <Text>❤️ {post?.likes_count ?? 0}</Text>
            </TouchableOpacity>
          </View>

          {post?.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

          <Text style={styles.commentsHeader}>{comments.length} Comments</Text>
          {comments.map((c: Comment) => (
            <View key={c.id} style={styles.comment}>
              <Text style={styles.commentUser}>{c.user?.name ?? 'User'}</Text>
              <Text style={styles.commentBody}>{c.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.inputRow}>
          <View style={styles.inputAvatar}>
            <Text style={{ color: '#fff', fontSize: 12 }}>
              {user?.name?.charAt(0) ?? '?'}
            </Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Add a comment..."
            placeholderTextColor="#888"
            value={commentText}
            onChangeText={setCommentText}
          />
          <TouchableOpacity
            onPress={() => { if (commentText.trim()) commentMutation.mutate(commentText.trim()) }}
            disabled={!commentText.trim()}
          >
            <Text style={styles.sendBtn}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  back: { padding: 16 },
  backText: { color: '#00b4d8', fontSize: 16 },
  media: { width, height: width * 0.7 },
  spotChip: { margin: 12, alignSelf: 'flex-start', backgroundColor: 'rgba(0,180,216,0.2)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  spotChipText: { color: '#00b4d8', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#00b4d8', alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700' },
  userName: { flex: 1, color: '#fff', fontWeight: '600' },
  likeBtn: { padding: 8 },
  caption: { color: '#eee', paddingHorizontal: 16, paddingBottom: 12 },
  commentsHeader: { color: '#aaa', paddingHorizontal: 16, paddingBottom: 8, fontSize: 13 },
  comment: { paddingHorizontal: 16, paddingBottom: 12 },
  commentUser: { color: '#00b4d8', fontWeight: '600', fontSize: 13 },
  commentBody: { color: '#eee', fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', gap: 8 },
  inputAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#00b4d8', alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, color: '#fff' },
  sendBtn: { color: '#00b4d8', fontSize: 20, fontWeight: '700' },
})

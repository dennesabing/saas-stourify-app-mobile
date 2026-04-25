import { render } from '@testing-library/react-native'
import PostCard from '@/shared/components/PostCard'
import type { Post } from '@/shared/api/types'

const mockPost: Post = {
  id: '1',
  uuid: 'uuid-1',
  caption: 'Beautiful sunset',
  visibility: 'public',
  likes_count: 42,
  comments_count: 5,
  created_at: new Date().toISOString(),
  user: { id: '1', uuid: 'u1', name: 'Ana Martinez', email: 'ana@test.com' },
  media: [{ id: 'm1', url: 'https://example.com/photo.jpg', type: 'photo', order: 0 }],
}

test('renders post caption', () => {
  const { getByText } = render(<PostCard post={mockPost} onPress={() => {}} />)
  expect(getByText('Beautiful sunset')).toBeTruthy()
})

test('renders user name', () => {
  const { getByText } = render(<PostCard post={mockPost} onPress={() => {}} />)
  expect(getByText('Ana Martinez')).toBeTruthy()
})

test('renders like count', () => {
  const { getByText } = render(<PostCard post={mockPost} onPress={() => {}} />)
  expect(getByText('42')).toBeTruthy()
})

test('renders "Unknown" when user is missing', () => {
  const postNoUser = { ...mockPost, user: undefined } as Post
  const { getByText } = render(<PostCard post={postNoUser} onPress={() => {}} />)
  expect(getByText('Unknown')).toBeTruthy()
})

test('renders without crashing when media is empty', () => {
  const postNoMedia = { ...mockPost, media: [] }
  const { getByText } = render(<PostCard post={postNoMedia} onPress={() => {}} />)
  expect(getByText('Beautiful sunset')).toBeTruthy()
})

test('renders without caption when caption is undefined', () => {
  const postNoCaption = { ...mockPost, caption: undefined } as Post
  const { getByText } = render(<PostCard post={postNoCaption} onPress={() => {}} />)
  expect(getByText('Ana Martinez')).toBeTruthy()
})

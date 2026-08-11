import { fireEvent, render, screen } from '@testing-library/react-native'
import PostCard from '@/shared/components/ui/PostCard'
import { ThemeProvider } from '@/theme/ThemeProvider'
import type { Post } from '@/shared/api/types'

function renderThemed(ui: React.ReactElement) {
  return render(<ThemeProvider scheme="light">{ui}</ThemeProvider>)
}

const mockPost: Post = {
  uuid: 'uuid-1',
  caption: 'Beautiful sunset',
  visibility: 'public',
  is_published: true,
  published_at: new Date().toISOString(),
  likes_count: 42,
  comments_count: 5,
  is_liked: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  can: {},
  author: { uuid: 'u1', name: 'Ana Martinez', username: 'ana', avatar_url: null },
}

test('renders the author name and username from the nested author', () => {
  renderThemed(<PostCard post={mockPost} onPress={() => {}} />)
  expect(screen.getByText('Ana Martinez')).toBeTruthy()
  expect(screen.getByText('@ana')).toBeTruthy()
})

test('renders the caption', () => {
  renderThemed(<PostCard post={mockPost} onPress={() => {}} />)
  expect(screen.getByText('Beautiful sunset')).toBeTruthy()
})

test('renders without caption when caption is absent', () => {
  const { caption, ...rest } = mockPost
  renderThemed(<PostCard post={rest as Post} onPress={() => {}} />)
  expect(screen.getByText('Ana Martinez')).toBeTruthy()
})

test('renders like and comment counts', () => {
  renderThemed(<PostCard post={mockPost} onPress={() => {}} />)
  expect(screen.getByText('42')).toBeTruthy()
  expect(screen.getByText('5')).toBeTruthy()
})

test('calls onPress when the card is pressed', () => {
  const onPress = jest.fn()
  renderThemed(<PostCard post={mockPost} onPress={onPress} />)
  fireEvent.press(screen.getByLabelText('Post by Ana Martinez'))
  expect(onPress).toHaveBeenCalledTimes(1)
})

test('calls onLikePress when the like action is pressed', () => {
  const onLikePress = jest.fn()
  renderThemed(<PostCard post={mockPost} onPress={() => {}} onLikePress={onLikePress} />)
  fireEvent.press(screen.getByLabelText('Like'))
  expect(onLikePress).toHaveBeenCalledTimes(1)
})

test('shows a filled like state from is_liked', () => {
  renderThemed(<PostCard post={{ ...mockPost, is_liked: true }} onPress={() => {}} />)
  expect(screen.getByLabelText('Like').props.accessibilityState).toEqual(
    expect.objectContaining({ selected: true }),
  )
})

test('does not show a filled like state when is_liked is false', () => {
  renderThemed(<PostCard post={mockPost} onPress={() => {}} />)
  expect(screen.getByLabelText('Like').props.accessibilityState).toEqual(
    expect.objectContaining({ selected: false }),
  )
})

test('falls back gracefully when author is absent', () => {
  const { author, ...rest } = mockPost
  renderThemed(<PostCard post={rest as Post} onPress={() => {}} />)
  expect(screen.getByText('Unknown')).toBeTruthy()
})

/**
 * STOURIFY-18's acceptance criterion 6 is that a composed post reaches the feed
 * *with its photo*. The upload flow was verified live — `POST /media/attach`
 * lands the object and `PostResource` returns it — and the post still rendered
 * as text, because this card was written against a docblock claiming
 * `PostResource` has no `media` key. It does.
 */
test('renders the first attached photo', () => {
  const post: Post = {
    ...mockPost,
    media: [
      { uuid: 'm1', url: 'https://cdn.example.com/a.jpg', thumb_url: null },
      { uuid: 'm2', url: 'https://cdn.example.com/b.jpg', thumb_url: null },
    ],
  }
  renderThemed(<PostCard post={post} onPress={() => {}} />)
  const photo = screen.getByLabelText('Photo in post by Ana Martinez')
  expect(photo.props.source).toEqual(expect.objectContaining({ uri: 'https://cdn.example.com/a.jpg' }))
})

test('renders no photo when the post has no media', () => {
  renderThemed(<PostCard post={mockPost} onPress={() => {}} />)
  expect(screen.queryByLabelText('Photo in post by Ana Martinez')).toBeNull()
})

test('renders no photo when media is an empty array', () => {
  renderThemed(<PostCard post={{ ...mockPost, media: [] }} onPress={() => {}} />)
  expect(screen.queryByLabelText('Photo in post by Ana Martinez')).toBeNull()
})

test('meets the minimum touch target on both actions', () => {
  renderThemed(<PostCard post={mockPost} onPress={() => {}} onLikePress={() => {}} />)
  const like = screen.getByLabelText('Like')
  const comments = screen.getByLabelText('Comments')
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : ((style ?? {}) as Record<string, unknown>)
  expect(flatten(like.props.style).minHeight).toBeGreaterThanOrEqual(44)
  expect(flatten(comments.props.style).minHeight).toBeGreaterThanOrEqual(44)
})

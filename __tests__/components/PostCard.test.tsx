import { fireEvent, render, screen } from '@testing-library/react-native'
import PostCard from '@/shared/components/ui/PostCard'
import { ThemeProvider } from '@/theme/ThemeProvider'
import type { Post } from '@/shared/api/types'

function renderThemed(ui: React.ReactElement) {
  return render(<ThemeProvider scheme="light">{ui}</ThemeProvider>)
}

const mockPost: Post = {
  id: '1',
  uuid: 'uuid-1',
  caption: 'Beautiful sunset',
  visibility: 'public',
  likes_count: 42,
  comments_count: 5,
  is_liked: false,
  created_at: new Date().toISOString(),
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

test('meets the minimum touch target on both actions', () => {
  renderThemed(<PostCard post={mockPost} onPress={() => {}} onLikePress={() => {}} />)
  const like = screen.getByLabelText('Like')
  const comments = screen.getByLabelText('Comments')
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : ((style ?? {}) as Record<string, unknown>)
  expect(flatten(like.props.style).minHeight).toBeGreaterThanOrEqual(44)
  expect(flatten(comments.props.style).minHeight).toBeGreaterThanOrEqual(44)
})

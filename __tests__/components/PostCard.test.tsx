import { fireEvent, render, screen } from '@testing-library/react-native'
import PostCard from '@/shared/components/ui/PostCard'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { palette } from '@/theme/tokens'
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
  expect(photo.props.source).toEqual(
    expect.objectContaining({ uri: 'https://cdn.example.com/a.jpg' }),
  )
})

/**
 * An empty picture frame on a wall still shows the wall behind it. This photo
 * box declared no colour at all, so while an image was still downloading — or
 * failed to — it borrowed whatever happened to be underneath. Giving it a theme
 * colour means the gap is a deliberate part of the design rather than an
 * accident of stacking order (STOURIFY-102).
 */
test('draws the photo on a theme background', () => {
  const post: Post = {
    ...mockPost,
    media: [{ uuid: 'm1', url: 'https://cdn.example.com/a.jpg', thumb_url: null }],
  }
  renderThemed(<PostCard post={post} onPress={() => {}} />)

  const style = screen.getByLabelText('Photo in post by Ana Martinez').props.style
  const flat = Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity)) : style
  expect(flat.backgroundColor).toBe(palette.light.surfaceAlt)
})

test('renders no photo when the post has no media', () => {
  renderThemed(<PostCard post={mockPost} onPress={() => {}} />)
  expect(screen.queryByLabelText('Photo in post by Ana Martinez')).toBeNull()
})

test('renders no photo when media is an empty array', () => {
  renderThemed(<PostCard post={{ ...mockPost, media: [] }} onPress={() => {}} />)
  expect(screen.queryByLabelText('Photo in post by Ana Martinez')).toBeNull()
})

/**
 * The spot chip's label comes from `title` — the only spot name
 * `SpotResource::toArray()` has ever sent. This fixture is deliberately the
 * server's exact shape, so a chip that reads any other key renders `undefined`
 * here exactly as it did on device (STOURIFY-11).
 */
test('labels the spot chip from the spot title', () => {
  const post: Post = {
    ...mockPost,
    spot: {
      uuid: 'spot-1',
      title: 'Kalaklan Lighthouse',
      slug: 'kalaklan-lighthouse',
      latitude: 14.8386,
      longitude: 120.2842,
      status: 'active',
    },
  }
  renderThemed(<PostCard post={post} onPress={() => {}} />)
  expect(screen.getByText('Kalaklan Lighthouse')).toBeTruthy()
})

test('meets the minimum touch target on both actions', () => {
  renderThemed(<PostCard post={mockPost} onPress={() => {}} onLikePress={() => {}} />)
  const like = screen.getByLabelText('Like')
  const comments = screen.getByLabelText('Comments')
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : ((style ?? {}) as Record<string, unknown>)
  expect(flatten(like.props.style).minHeight).toBeGreaterThanOrEqual(44)
  expect(flatten(comments.props.style).minHeight).toBeGreaterThanOrEqual(44)
})

/**
 * The author tap-target (STOURIFY-35).
 *
 * The parent card's rationale is that "a spot with an author you cannot tap is
 * a broken loop". This header was an inert `View`: the profile route existed,
 * real content named its author, and there was no way to get from one to the
 * other. The pressable is scoped to the identity block on purpose — pressing
 * the photo or the caption still opens the post.
 */
test('pressing the author identity calls onAuthorPress, not onPress', () => {
  const onPress = jest.fn()
  const onAuthorPress = jest.fn()
  renderThemed(<PostCard post={mockPost} onPress={onPress} onAuthorPress={onAuthorPress} />)

  fireEvent.press(screen.getByLabelText("Ana Martinez's profile"))

  expect(onAuthorPress).toHaveBeenCalledTimes(1)
  expect(onPress).not.toHaveBeenCalled()
})

test('the author is not a tap-target when the post has no author to open', () => {
  const { author, ...rest } = mockPost
  renderThemed(<PostCard post={rest as Post} onPress={() => {}} onAuthorPress={jest.fn()} />)

  expect(screen.queryByLabelText("Unknown's profile")).toBeNull()
})

test('the author is inert when no handler is supplied', () => {
  renderThemed(<PostCard post={mockPost} onPress={() => {}} />)

  expect(screen.queryByLabelText("Ana Martinez's profile")).toBeNull()
})

/**
 * The report affordance (STOURIFY-37).
 *
 * Optional in exactly the way `onAuthorPress` is: a card rendered somewhere
 * with nothing to report to — a picker, a preview — must not show a control
 * that does nothing. The card itself knows nothing about reporting; it raises
 * the tap and the screen decides.
 */
test('the overflow control appears only when a handler is supplied', () => {
  renderThemed(<PostCard post={mockPost} onPress={() => {}} />)
  expect(screen.queryByLabelText('More options for this post')).toBeNull()

  screen.unmount()

  renderThemed(<PostCard post={mockPost} onPress={() => {}} onMorePress={jest.fn()} />)
  expect(screen.getByLabelText('More options for this post')).toBeTruthy()
})

test('pressing the overflow control does not also open the post', () => {
  const onPress = jest.fn()
  const onMorePress = jest.fn()
  renderThemed(<PostCard post={mockPost} onPress={onPress} onMorePress={onMorePress} />)

  fireEvent.press(screen.getByLabelText('More options for this post'))

  expect(onMorePress).toHaveBeenCalledTimes(1)
  expect(onPress).not.toHaveBeenCalled()
})

/**
 * The hashtag half (STOURIFY-173).
 *
 * Note what `mockPost` does NOT have: a `tags` array. That absence is the whole
 * point of these two tests rather than an oversight in the fixture. A post
 * written with no signal waits in the send-later queue and has never been near
 * the server, so the server has never parsed it and there is no `tags` array to
 * read — but the caption is in hand, and the card reads the words from that.
 * Render the chips from the response instead and a queued post's hashtags are
 * invisible at exactly the moment somebody is most likely to be looking at it.
 */
test('makes a hashtag in the caption pressable, from the caption alone', () => {
  const onHashtagPress = jest.fn()
  const post = { ...mockPost, caption: 'great noodles #StreetFood' }

  renderThemed(<PostCard post={post} onPress={() => {}} onHashtagPress={onHashtagPress} />)
  fireEvent.press(screen.getByText('#StreetFood'))

  // The word keeps the author's spelling on screen; the slug is what travels.
  expect(onHashtagPress).toHaveBeenCalledWith('streetfood')
})

test('leaves the caption as plain text where there is nowhere for a tap to go', () => {
  // A card rendered somewhere with no tag route — a picker, a preview — must
  // not offer a tap that does nothing, which is the defect STOURIFY-9 and
  // STOURIFY-148 both record. Without the handler the words stay ordinary.
  const post = { ...mockPost, caption: 'great noodles #StreetFood' }

  renderThemed(<PostCard post={post} onPress={() => {}} />)

  expect(screen.getByText('great noodles #StreetFood')).toBeTruthy()
})

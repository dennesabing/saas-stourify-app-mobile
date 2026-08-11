import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import PostDetailScreen from '@/features/feed/screens/PostDetailScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/posts', () => ({
  getPost: jest.fn(),
  toggleLike: jest.fn(),
}))

import { getPost, toggleLike } from '@/shared/api/posts'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function makePost(overrides: Partial<any> = {}) {
  return {
    id: '1',
    uuid: 'post-1',
    caption: 'Sunset at the cove',
    visibility: 'public',
    likes_count: 3,
    comments_count: 2,
    is_liked: false,
    created_at: new Date().toISOString(),
    author: { uuid: 'u1', name: 'Ana Martinez', username: 'ana', avatar_url: null },
    // `title` is what SpotResource actually sends. This fixture carried only
    // the legacy `name` alias, so it agreed with the screen's bug instead of
    // with the server, and the blank spot chip on device passed here. `name`
    // is gone from the `Spot` type entirely as of STOURIFY-11.
    spot: {
      uuid: 'spot-1',
      title: 'Blue Cove',
      slug: 'blue-cove',
      latitude: 1,
      longitude: 1,
      status: 'active',
    },
    ...overrides,
  }
}

function renderScreen(postId = 'post-1') {
  return render(
    <TestProviders database={createTestDatabase()}>
      <PostDetailScreen navigation={navigation} route={{ params: { postId } } as any} />
    </TestProviders>,
  )
}

beforeEach(() => jest.clearAllMocks())

it('renders the post author, caption and comment count', async () => {
  ;(getPost as jest.Mock).mockResolvedValue(makePost())

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Ana Martinez')).toBeTruthy()
    expect(screen.getByText('Sunset at the cove')).toBeTruthy()
    expect(screen.getByText('View all 2 comments')).toBeTruthy()
  })
})

it('navigates to the spot when the spot chip is pressed', async () => {
  ;(getPost as jest.Mock).mockResolvedValue(makePost())

  renderScreen()

  await waitFor(() => expect(screen.getByText(/Blue Cove/)).toBeTruthy())
  fireEvent.press(screen.getByText(/Blue Cove/))

  expect(navigation.navigate).toHaveBeenCalledWith('SpotDetail', { spotId: 'spot-1' })
})

it('navigates to comments when "View all N comments" is pressed', async () => {
  ;(getPost as jest.Mock).mockResolvedValue(makePost())

  renderScreen()

  await waitFor(() => expect(screen.getByText('View all 2 comments')).toBeTruthy())
  fireEvent.press(screen.getByText('View all 2 comments'))

  expect(navigation.navigate).toHaveBeenCalledWith('Comments', { postId: 'post-1' })
})

it('flips the like state optimistically and rolls back on failure', async () => {
  ;(getPost as jest.Mock).mockResolvedValue(makePost({ is_liked: false, likes_count: 3 }))

  let rejectLike!: (err: Error) => void
  ;(toggleLike as jest.Mock).mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectLike = reject
    }),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByText('Sunset at the cove')).toBeTruthy())
  expect(screen.getByText('3')).toBeTruthy()

  fireEvent.press(screen.getByLabelText('Like'))

  await waitFor(() => expect(screen.getByText('4')).toBeTruthy())

  rejectLike(new Error('offline'))

  await waitFor(() => expect(screen.getByText('3')).toBeTruthy())
})

/**
 * The author header on the detail screen is the second half of STOURIFY-35's
 * tap path — a reader who opened a post and then wants the person behind it
 * should not have to go back to the feed to reach them.
 */
it('opens the author profile from the detail header', async () => {
  ;(getPost as jest.Mock).mockResolvedValue(makePost())

  renderScreen()

  fireEvent.press(await screen.findByLabelText("Ana Martinez's profile"))

  expect(navigation.navigate).toHaveBeenCalledWith('Profile', { userId: 'u1' })
})

it('does not offer an author tap-target when the author was never loaded', async () => {
  const { author, ...rest } = makePost()
  ;(getPost as jest.Mock).mockResolvedValue(rest)

  renderScreen()

  await waitFor(() => expect(screen.getByText('Unknown')).toBeTruthy())
  expect(screen.queryByLabelText("Unknown's profile")).toBeNull()
})

import { AxiosError, type AxiosResponse } from 'axios'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import PostDetailScreen from '@/features/feed/screens/PostDetailScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'
import { trackQueryClient } from '../support/queryClients'

jest.mock('@/shared/api/posts', () => ({
  getPost: jest.fn(),
  setPostLike: jest.fn(),
}))

jest.mock('@/shared/api/reports', () => {
  const actual = jest.requireActual('@/shared/api/reports')
  return { ...actual, fileReport: jest.fn() }
})

import { getPost, setPostLike } from '@/shared/api/posts'
import { fileReport } from '@/shared/api/reports'

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
      status: 'published',
    },
    ...overrides,
  }
}

function renderScreen(postId = 'post-1', queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
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

/**
 * The design's "248 likes · tap to see who", minus the half with nothing behind
 * it: there is no likers list, so the line states the count and is not a button
 * (STOURIFY-260).
 */
it('states the like count in words, and does not offer it as a button', async () => {
  ;(getPost as jest.Mock).mockResolvedValue(makePost({ likes_count: 3 }))

  renderScreen()

  await waitFor(() => expect(screen.getByText('3 likes')).toBeTruthy())
  expect(screen.queryByText(/tap to see who/i)).toBeNull()
})

it('says "1 like", not "1 likes"', async () => {
  ;(getPost as jest.Mock).mockResolvedValue(makePost({ likes_count: 1 }))

  renderScreen()

  await waitFor(() => expect(screen.getByText('1 like')).toBeTruthy())
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
  ;(setPostLike as jest.Mock).mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectLike = reject
    }),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByText('Sunset at the cove')).toBeTruthy())
  expect(screen.getByText('3')).toBeTruthy()

  fireEvent.press(screen.getByLabelText('Like'))

  await waitFor(() => expect(screen.getByText('4')).toBeTruthy())

  // The state asked for, not an instruction to flip — see `setPostLike`.
  expect(setPostLike).toHaveBeenCalledWith('post-1', true)

  rejectLike(new Error('offline'))

  await waitFor(() => expect(screen.getByText('3')).toBeTruthy())
})

/**
 * The detail screen and the feed have to agree about this, because a reader moves
 * between them mid-gesture: like on the feed, open the post, tap again to undo.
 * If either screen sent a toggle instead of an intention, that second tap would
 * do whatever the server's copy implied rather than what was asked for.
 */
it('asks for the like to be removed when the post is already liked', async () => {
  ;(getPost as jest.Mock).mockResolvedValue(makePost({ is_liked: true, likes_count: 4 }))
  ;(setPostLike as jest.Mock).mockResolvedValue({ liked: false, likes_count: 3 })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Sunset at the cove')).toBeTruthy())

  fireEvent.press(screen.getByLabelText('Like'))

  await waitFor(() => expect(setPostLike).toHaveBeenCalledWith('post-1', false))
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

/**
 * Reporting a post from its own screen (STOURIFY-37).
 *
 * Both places a post is visible carry the affordance — the feed row and here.
 * A reader who opened a post to look closer is the reader most likely to decide
 * it needs reporting, and sending them back to the feed to do it is the kind of
 * friction that means it never gets used.
 */
it('files a report for this post from the detail header', async () => {
  ;(getPost as jest.Mock).mockResolvedValue(makePost())
  ;(fileReport as jest.Mock).mockResolvedValue({ uuid: 'report-1' })

  renderScreen()

  fireEvent.press(await screen.findByLabelText('More options for this post'))
  fireEvent.press(screen.getByText('Report'))
  fireEvent.press(screen.getByText('Spam or misleading'))
  fireEvent.press(screen.getByLabelText('Submit report'))

  await waitFor(() =>
    expect(fileReport).toHaveBeenCalledWith(
      expect.objectContaining({ reportableType: 'post', reportableUuid: 'post-1' }),
    ),
  )
})

/**
 * STOURIFY-279. This screen had no failure branch at all: it drew its loading
 * placeholders whenever `isLoading || !post`, and a failed request leaves `post`
 * undefined for good — so a refused, missing or unreachable post looked like a
 * slow load that might still finish, with Back the only way out.
 *
 * The 403 and network tests are a pair, as on every screen since STOURIFY-225:
 * the first alone would pass if the connection wording were deleted everywhere,
 * which would break the one case where it is true.
 */
describe('when the post cannot be loaded', () => {
  function answered(status: number, statusText: string) {
    const config = { headers: {} } as never
    return new AxiosError(`Request failed with status code ${status}`, String(status), config, {}, {
      status,
      statusText,
      data: { message: statusText },
      headers: {},
      config,
    } as AxiosResponse)
  }

  function unreachable() {
    return new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never, {})
  }

  it('does not blame the connection at all when the server answered 403', async () => {
    ;(getPost as jest.Mock).mockRejectedValue(answered(403, 'This action is unauthorized.'))
    renderScreen()

    await waitFor(() => expect(screen.getByText("Couldn't load this post")).toBeTruthy())
    expect(screen.getByText(/isn't allowed/i)).toBeTruthy()
    expect(screen.queryByText(/can't reach|connection|network|signal/i)).toBeNull()
  })

  it('says the post could not be found when the server answered 404', async () => {
    ;(getPost as jest.Mock).mockRejectedValue(answered(404, 'Not Found'))
    renderScreen()

    await waitFor(() => expect(screen.getByText("Couldn't load this post")).toBeTruthy())
    expect(screen.getByText(/couldn't find this/i)).toBeTruthy()
  })

  it('still blames the connection when there really was no answer', async () => {
    ;(getPost as jest.Mock).mockRejectedValue(unreachable())
    renderScreen()

    await waitFor(() => expect(screen.getByText("Couldn't load this post")).toBeTruthy())
    expect(screen.getByText(/check your connection/i)).toBeTruthy()
  })

  it('asks for the post again when Try again is pressed', async () => {
    ;(getPost as jest.Mock).mockRejectedValue(unreachable())
    renderScreen()

    await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())
    expect(getPost).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('Try again'))

    // Copy without a working button is a nicer dead end, not a way out.
    await waitFor(() => expect((getPost as jest.Mock).mock.calls.length).toBeGreaterThan(1))
  })

  /**
   * Content beats an error. React Query keeps serving a post it already holds
   * while a background refresh fails, so `isError` is true here while the
   * reader is looking at a perfectly good post. This is what pins the failure
   * branch to `isError && !post` rather than `isError` alone.
   */
  it('keeps showing a post it already has while the refresh is failing', async () => {
    const queryClient = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
    queryClient.setQueryData(['post', 'post-1'], makePost())
    ;(getPost as jest.Mock).mockRejectedValue(unreachable())

    renderScreen('post-1', queryClient)

    await waitFor(() => expect(getPost).toHaveBeenCalled())
    await waitFor(() => expect(queryClient.getQueryState(['post', 'post-1'])?.status).toBe('error'))

    expect(screen.getByText('Sunset at the cove')).toBeTruthy()
    expect(screen.getByText('View all 2 comments')).toBeTruthy()
    expect(screen.queryByText("Couldn't load this post")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })
})

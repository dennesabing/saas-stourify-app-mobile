import { QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import CommentsScreen from '@/features/feed/screens/CommentsScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/comments', () => ({
  getComments: jest.fn(),
  createComment: jest.fn(),
  getSpotAboutComments: jest.fn(),
  createSpotAboutComment: jest.fn(),
}))

import {
  createComment,
  createSpotAboutComment,
  getComments,
  getSpotAboutComments,
} from '@/shared/api/comments'
import { trackQueryClient } from '../support/queryClients'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function renderScreen(postId = 'post-1', queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <CommentsScreen navigation={navigation} route={{ params: { postId } } as any} />
    </TestProviders>,
  )
}

/** The same screen, opened on the other kind of host: a Spot About entry. */
function renderAboutScreen(spotAboutId = 'about-1', queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <CommentsScreen navigation={navigation} route={{ params: { spotAboutId } } as any} />
    </TestProviders>,
  )
}

beforeEach(() => jest.clearAllMocks())

it('renders a thread — a top-level comment with its reply indented under it', async () => {
  ;(getComments as jest.Mock).mockResolvedValue({
    data: [
      { id: 'c1', body: 'Great shot!', user: { id: 'u1', name: 'Ana Martinez' }, parent_id: null, created_at: new Date().toISOString() },
      { id: 'c2', body: 'Agreed', user: { id: 'u2', name: 'Ben Cruz' }, parent_id: 'c1', created_at: new Date().toISOString() },
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 2 },
  })

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Great shot!')).toBeTruthy()
    expect(screen.getByText('Agreed')).toBeTruthy()
  })
})

/**
 * The three situations this screen used to answer with two sentences
 * (STOURIFY-86).
 *
 * "We are still asking", "we could not ask" and "we asked and there is
 * nothing" are different facts with different remedies, and only the middle
 * one has an action worth offering. Before this card a failed request fell
 * into the empty branch and told the reader there were no comments — a claim
 * about the post, made on the strength of a timeout.
 *
 * Each case asserts the presence of its own copy AND the absence of the
 * others'. Presence alone would pass against a screen that stacked all three,
 * which is not a screen that tells them apart.
 */
describe('a failed comments request is not an empty thread', () => {
  it('says the request failed, and offers a retry that re-runs the query', async () => {
    ;(getComments as jest.Mock).mockRejectedValue(new Error('timeout of 15000ms exceeded'))

    renderScreen()

    await waitFor(() => expect(screen.getByText("Couldn't load the comments")).toBeTruthy())
    expect(screen.queryByText('No comments yet')).toBeNull()

    expect(getComments).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('Try again'))

    await waitFor(() => expect(getComments).toHaveBeenCalledTimes(2))
  })

  it('still says there are no comments when the request succeeds with none', async () => {
    ;(getComments as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

    renderScreen()

    await waitFor(() => expect(screen.getByText('No comments yet')).toBeTruthy())
    expect(screen.queryByText("Couldn't load the comments")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('claims neither while the request is still in flight', async () => {
    // Never settles, so the screen stays in its first-load state.
    ;(getComments as jest.Mock).mockReturnValue(new Promise(() => {}))

    renderScreen()

    // This screen's loading treatment is deliberately nothing at all — so the
    // assertion is that it rendered and yet made no claim either way.
    await waitFor(() => expect(screen.getByText('Comments')).toBeTruthy())
    expect(screen.queryByText('No comments yet')).toBeNull()
    expect(screen.queryByText("Couldn't load the comments")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('keeps showing cached comments when a later fetch fails', async () => {
    ;(getComments as jest.Mock).mockRejectedValue(new Error('offline'))

    // Rows the reader could already read. The error branch lives inside
    // `ListEmptyComponent`, which never renders while rows exist — so a
    // failing refetch must not cover them.
    const seeded = trackQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }))
    seeded.setQueryData(['comments', 'post-1'], {
      data: [
        { id: 'c1', body: 'Cached from earlier', user: { id: 'u1', name: 'Ana Martinez' }, parent_id: null, created_at: new Date().toISOString() },
      ],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 1 },
    })

    renderScreen('post-1', seeded)

    await waitFor(() => expect(getComments).toHaveBeenCalled())

    expect(screen.getByText('Cached from earlier')).toBeTruthy()
    expect(screen.queryByText("Couldn't load the comments")).toBeNull()
    expect(screen.queryByText('No comments yet')).toBeNull()
  })
})

it('appends the new comment optimistically when posting', async () => {
  ;(getComments as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  let resolveCreate!: (value: unknown) => void
  ;(createComment as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveCreate = resolve
    }),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByText('No comments yet')).toBeTruthy())

  fireEvent.changeText(screen.getByPlaceholderText('Add a comment...'), 'Nice spot')
  fireEvent.press(screen.getByLabelText('Post comment'))

  // Appears immediately, before the network call resolves.
  await waitFor(() => expect(screen.getByText('Nice spot')).toBeTruthy())

  resolveCreate({ id: 'c3', body: 'Nice spot', user: { id: 'me', name: 'Me' }, parent_id: null, created_at: new Date().toISOString() })

  await waitFor(() => expect(createComment).toHaveBeenCalledWith('post-1', 'Nice spot'))
})

/**
 * The same screen, opened on a Spot About entry instead of a post
 * (STOURIFY-148).
 *
 * One room with two doors. Everything below the route parameter — flattening
 * replies into indented rows, telling "still asking" apart from "could not
 * ask", the optimistic composer — was never about posts, so it is not rebuilt
 * for the second host. These tests exist to prove that claim rather than to
 * assert it: each one is the About twin of a post case above, and a failure
 * here means the host switch reached further into the screen than it should
 * have.
 */
describe('opened on a Spot About entry', () => {
  /**
   * A thread shaped the way the server really answers, checked against a live
   * response rather than copied from the post fixture above.
   *
   * Two things it does NOT do, both deliberate. It is not sorted oldest-first —
   * both comment endpoints call `latest()`, so newest comes first. And it holds
   * no reply, because a reply cannot currently be drawn at all: the API sends a
   * comment's own `id` as a UUID and its `parent_id` as a numeric database id,
   * so nothing on the client can match the two (STOURIFY-152, filed from this
   * card's live run). Writing a fixture with a UUID `parent_id` would make a
   * test pass over a payload that has never existed — the exact trap
   * STOURIFY-146 recorded — so this one stays flat and this card claims only
   * what it can actually deliver.
   */
  const thread = {
    data: [
      { id: 'c2', body: 'Confirmed, the barrier came down on us.', user: { id: 'u2', name: 'Ben Cruz' }, parent_id: null, created_at: new Date().toISOString() },
      { id: 'c1', body: 'The car park closes at six.', user: { id: 'u1', name: 'Ana Martinez' }, parent_id: null, created_at: new Date().toISOString() },
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 2 },
  }

  /**
   * The whole of the host switch, asserted in both directions.
   *
   * One direction alone would pass against a screen that called BOTH endpoints
   * on every open — which is not a screen that tells the two hosts apart, and
   * would send a spot's UUID to `/posts/…` on every single visit.
   */
  it('asks the About entry’s thread endpoint, and never the post one', async () => {
    ;(getSpotAboutComments as jest.Mock).mockResolvedValue(thread)

    renderAboutScreen('about-1')

    await waitFor(() => expect(getSpotAboutComments).toHaveBeenCalledWith('about-1'))
    expect(getComments).not.toHaveBeenCalled()
  })

  it('still asks the post endpoint when it was opened on a post', async () => {
    ;(getComments as jest.Mock).mockResolvedValue(thread)

    renderScreen('post-1')

    await waitFor(() => expect(getComments).toHaveBeenCalledWith('post-1'))
    expect(getSpotAboutComments).not.toHaveBeenCalled()
  })

  it('renders every comment the server sent, in the order it sent them', async () => {
    ;(getSpotAboutComments as jest.Mock).mockResolvedValue(thread)

    renderAboutScreen('about-1')

    await waitFor(() => {
      expect(screen.getByText('The car park closes at six.')).toBeTruthy()
      expect(screen.getByText('Confirmed, the barrier came down on us.')).toBeTruthy()
    })
  })

  /**
   * The same three sentences for three different situations that STOURIFY-86
   * gave the post case. Inheriting a behaviour and having tested it are
   * different claims, so the twin is asserted rather than assumed.
   */
  it('says the request failed rather than that there are no replies', async () => {
    ;(getSpotAboutComments as jest.Mock).mockRejectedValue(new Error('timeout of 15000ms exceeded'))

    renderAboutScreen('about-1')

    await waitFor(() => expect(screen.getByText("Couldn't load the comments")).toBeTruthy())
    expect(screen.queryByText('No comments yet')).toBeNull()

    expect(getSpotAboutComments).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('Try again'))

    await waitFor(() => expect(getSpotAboutComments).toHaveBeenCalledTimes(2))
  })

  it('says there are no replies when the request succeeds with none', async () => {
    ;(getSpotAboutComments as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

    renderAboutScreen('about-1')

    await waitFor(() => expect(screen.getByText('No comments yet')).toBeTruthy())
    expect(screen.queryByText("Couldn't load the comments")).toBeNull()
  })

  it('shows a reply the moment it is sent, before the request settles', async () => {
    ;(getSpotAboutComments as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })
    ;(createSpotAboutComment as jest.Mock).mockReturnValue(new Promise(() => {}))

    renderAboutScreen('about-1')

    await waitFor(() => expect(screen.getByText('No comments yet')).toBeTruthy())

    fireEvent.changeText(screen.getByPlaceholderText('Add a comment...'), '  Thanks, that helped  ')
    fireEvent.press(screen.getByLabelText('Post comment'))

    await waitFor(() => expect(screen.getByText('Thanks, that helped')).toBeTruthy())
    expect(createSpotAboutComment).toHaveBeenCalledWith('about-1', 'Thanks, that helped')
    expect(createComment).not.toHaveBeenCalled()
  })

  /**
   * The reply count on the tab behind this screen is a number the SERVER
   * computes, so a reply written here leaves it one short until something asks
   * again. Going back to a count that disagrees with the thread you just added
   * to reads as the reply not having been saved.
   *
   * The post case has no such number anywhere and must not pay for the
   * request, which is why the second half of this test matters as much as the
   * first.
   */
  it('asks the About list to refetch, so the reply count behind it catches up', async () => {
    ;(getSpotAboutComments as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })
    ;(createSpotAboutComment as jest.Mock).mockResolvedValue({ id: 'c9', body: 'Thanks', parent_id: null, created_at: new Date().toISOString() })

    const client = trackQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }))
    const invalidate = jest.spyOn(client, 'invalidateQueries')

    renderAboutScreen('about-1', client)

    await waitFor(() => expect(screen.getByText('No comments yet')).toBeTruthy())

    fireEvent.changeText(screen.getByPlaceholderText('Add a comment...'), 'Thanks')
    fireEvent.press(screen.getByLabelText('Post comment'))

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['spot-abouts'] })),
    )
  })

  it('does not touch the About list when the reply was on a post', async () => {
    ;(getComments as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })
    ;(createComment as jest.Mock).mockResolvedValue({ id: 'c9', body: 'Nice', parent_id: null, created_at: new Date().toISOString() })

    const client = trackQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }))
    const invalidate = jest.spyOn(client, 'invalidateQueries')

    renderScreen('post-1', client)

    await waitFor(() => expect(screen.getByText('No comments yet')).toBeTruthy())

    fireEvent.changeText(screen.getByPlaceholderText('Add a comment...'), 'Nice')
    fireEvent.press(screen.getByLabelText('Post comment'))

    await waitFor(() => expect(createComment).toHaveBeenCalled())

    expect(invalidate).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['spot-abouts'] }))
  })
})

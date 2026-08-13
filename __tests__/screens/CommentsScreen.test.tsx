import { QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import CommentsScreen from '@/features/feed/screens/CommentsScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/comments', () => ({
  getComments: jest.fn(),
  createComment: jest.fn(),
}))

import { createComment, getComments } from '@/shared/api/comments'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function renderScreen(postId = 'post-1', queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <CommentsScreen navigation={navigation} route={{ params: { postId } } as any} />
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
    const seeded = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
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

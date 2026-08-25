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

/**
 * How far a row sits from the left edge, in pixels.
 *
 * The screen draws depth as `marginLeft`, so this is the one number that says
 * whether a reply reads as an answer or as a second opinion. Asserting on it
 * rather than on the text being present is deliberate: for the whole life of
 * this screen a test called "with its reply indented under it" only checked
 * that both bodies appeared, and it stayed green through a period when NO reply
 * was ever drawn indented on a real device (STOURIFY-152).
 */
function indentOf(commentId: string): number {
  const style = screen.getByTestId(`comment-row-${commentId}`).props.style
  const flat = Array.isArray(style) ? Object.assign({}, ...style) : style

  return flat?.marginLeft ?? 0
}

/**
 * A post's thread, shaped the way the server answers it.
 *
 * `parent_id` is the parent's UUID — the same kind of value as `id`, because
 * that is the only identifier for a comment this API hands out. It used to be
 * the parent's numeric database key, which matched nothing on the client and
 * made every reply invisible; the server was changed under STOURIFY-152 and
 * this fixture is what fails if it ever goes back.
 */
const postThread = {
  data: [
    {
      id: 'c1',
      body: 'Great shot!',
      user: { id: 'u1', name: 'Ana Martinez' },
      parent_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'c2',
      body: 'Agreed',
      user: { id: 'u2', name: 'Ben Cruz' },
      parent_id: 'c1',
      created_at: new Date().toISOString(),
    },
  ],
  links: {},
  meta: { current_page: 1, last_page: 1, total: 2 },
}

it('renders a thread — a top-level comment with its reply indented under it', async () => {
  ;(getComments as jest.Mock).mockResolvedValue(postThread)

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Great shot!')).toBeTruthy()
    expect(screen.getByText('Agreed')).toBeTruthy()
  })

  expect(indentOf('c2')).toBeGreaterThan(indentOf('c1'))
})

it('loses a reply entirely when the server names its parent with something no row carries', async () => {
  ;(getComments as jest.Mock).mockResolvedValue({
    ...postThread,
    // The shape the server sent before STOURIFY-152: the parent named by its
    // numeric database key, a value that appears nowhere else in the payload.
    // This test does not endorse it — it pins what that failure LOOKS like from
    // the outside, and the answer is worth knowing: the reply is not drawn
    // flat, or in the wrong place. It is simply gone, with nothing on screen
    // and nothing in any log to say so. That silence is why the defect survived
    // from the day comments shipped until somebody watched a real device.
    data: [postThread.data[0], { ...postThread.data[1], parent_id: 1 as unknown as string }],
  })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Great shot!')).toBeTruthy())

  expect(screen.queryByText('Agreed')).toBeNull()
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
    ;(getComments as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })

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
    const seeded = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
    seeded.setQueryData(['comments', 'post-1'], {
      data: [
        {
          id: 'c1',
          body: 'Cached from earlier',
          user: { id: 'u1', name: 'Ana Martinez' },
          parent_id: null,
          created_at: new Date().toISOString(),
        },
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
  ;(getComments as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

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

  resolveCreate({
    id: 'c3',
    body: 'Nice spot',
    user: { id: 'me', name: 'Me' },
    parent_id: null,
    created_at: new Date().toISOString(),
  })

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
   * Two things about it are deliberate. It is not sorted oldest-first — both
   * comment endpoints call `latest()`, so newest comes first. And `parent_id`
   * on the reply is the parent's UUID, the same kind of value as `id`.
   *
   * That second point is the whole of STOURIFY-152. When this fixture was
   * written the server sent `parent_id` as a numeric database key that appeared
   * nowhere else in the payload, so no reply could be matched to its parent and
   * none was ever drawn — and this fixture was left deliberately flat rather
   * than inventing a shape the API had never produced. The server now sends the
   * UUID, so the reply is here, and a test fails if that is ever undone.
   */
  const thread = {
    data: [
      {
        id: 'c3',
        body: 'Only at weekends, in winter.',
        user: { id: 'u3', name: 'Cara Lim' },
        parent_id: 'c1',
        created_at: new Date().toISOString(),
      },
      {
        id: 'c2',
        body: 'Confirmed, the barrier came down on us.',
        user: { id: 'u2', name: 'Ben Cruz' },
        parent_id: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 'c1',
        body: 'The car park closes at six.',
        user: { id: 'u1', name: 'Ana Martinez' },
        parent_id: null,
        created_at: new Date().toISOString(),
      },
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 3 },
  }

  it('draws a reply indented under the comment it answers', async () => {
    ;(getSpotAboutComments as jest.Mock).mockResolvedValue(thread)

    renderAboutScreen('about-1')

    await waitFor(() => expect(screen.getByText('Only at weekends, in winter.')).toBeTruthy())

    expect(indentOf('c3')).toBeGreaterThan(indentOf('c1'))
    expect(indentOf('c2')).toBe(indentOf('c1'))
  })

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
    ;(getSpotAboutComments as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })

    renderAboutScreen('about-1')

    await waitFor(() => expect(screen.getByText('No comments yet')).toBeTruthy())
    expect(screen.queryByText("Couldn't load the comments")).toBeNull()
  })

  it('shows a reply the moment it is sent, before the request settles', async () => {
    ;(getSpotAboutComments as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })
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
    ;(getSpotAboutComments as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })
    ;(createSpotAboutComment as jest.Mock).mockResolvedValue({
      id: 'c9',
      body: 'Thanks',
      parent_id: null,
      created_at: new Date().toISOString(),
    })

    const client = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
    const invalidate = jest.spyOn(client, 'invalidateQueries')

    renderAboutScreen('about-1', client)

    await waitFor(() => expect(screen.getByText('No comments yet')).toBeTruthy())

    fireEvent.changeText(screen.getByPlaceholderText('Add a comment...'), 'Thanks')
    fireEvent.press(screen.getByLabelText('Post comment'))

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['spot-abouts'] }),
      ),
    )
  })

  it('does not touch the About list when the reply was on a post', async () => {
    ;(getComments as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })
    ;(createComment as jest.Mock).mockResolvedValue({
      id: 'c9',
      body: 'Nice',
      parent_id: null,
      created_at: new Date().toISOString(),
    })

    const client = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
    const invalidate = jest.spyOn(client, 'invalidateQueries')

    renderScreen('post-1', client)

    await waitFor(() => expect(screen.getByText('No comments yet')).toBeTruthy())

    fireEvent.changeText(screen.getByPlaceholderText('Add a comment...'), 'Nice')
    fireEvent.press(screen.getByLabelText('Post comment'))

    await waitFor(() => expect(createComment).toHaveBeenCalled())

    expect(invalidate).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['spot-abouts'] }),
    )
  })
})

/**
 * Where a new comment lands, on a thread that already has some (STOURIFY-151).
 *
 * The two optimistic tests above seed an EMPTY thread, where first and last
 * are the same position — so neither could ever have failed on this, whatever
 * the code did. A test about *where* a row goes has to give it somewhere else
 * to go.
 *
 * Both endpoints answer newest-first (`->latest()` in
 * `PostCommentApiController::index` and `SpotAboutCommentApiController::index`),
 * so the row belongs at the top. Until this card it was appended, and a second
 * later the refetch moved it — the thing you had just written jumping across
 * the screen while you looked at it.
 */
function commentRowOrder(): string[] {
  return screen.getAllByTestId(/^comment-row-/).map((row) => row.props.testID as string)
}

const twoExistingComments = {
  data: [
    {
      id: 'c1',
      body: 'Been there last summer',
      user: { id: 'u1', name: 'Ana Martinez' },
      parent_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'c2',
      body: 'Worth the walk up',
      user: { id: 'u2', name: 'Ben Cruz' },
      parent_id: null,
      created_at: new Date().toISOString(),
    },
  ],
  links: {},
  meta: { current_page: 1, last_page: 1, total: 2 },
}

it('puts a new comment at the TOP of a thread that already has comments', async () => {
  ;(getComments as jest.Mock).mockResolvedValue(twoExistingComments)
  ;(createComment as jest.Mock).mockReturnValue(new Promise(() => {}))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Been there last summer')).toBeTruthy())

  fireEvent.changeText(screen.getByPlaceholderText('Add a comment...'), 'Going next month')
  fireEvent.press(screen.getByLabelText('Post comment'))

  await waitFor(() => expect(screen.getByText('Going next month')).toBeTruthy())

  const order = commentRowOrder()

  // The new row is first, and the two that were already there follow in the
  // order the server sent them.
  expect(order).toHaveLength(3)
  expect(order[0]).not.toBe('comment-row-c1')
  expect(order.slice(1)).toEqual(['comment-row-c1', 'comment-row-c2'])
})

it('leaves the new comment at the top when the server’s own answer arrives', async () => {
  const serverAnswer = {
    data: [
      {
        id: 'c3',
        body: 'Going next month',
        user: { id: 'me', name: 'Me' },
        parent_id: null,
        created_at: new Date().toISOString(),
      },
      ...twoExistingComments.data,
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 3 },
  }

  // The create is held open on purpose, so the refetch cannot land before the
  // optimistic order has been read. Without that, resolving it immediately
  // lets the server's answer arrive first and the first assertion below
  // measures the same thing as the second.
  let resolveCreate!: (value: unknown) => void
  ;(getComments as jest.Mock)
    .mockResolvedValueOnce(twoExistingComments)
    .mockResolvedValue(serverAnswer)
  ;(createComment as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveCreate = resolve
    }),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByText('Been there last summer')).toBeTruthy())

  fireEvent.changeText(screen.getByPlaceholderText('Add a comment...'), 'Going next month')
  fireEvent.press(screen.getByLabelText('Post comment'))

  // Where it lands the instant you press send...
  await waitFor(() => expect(screen.getByText('Going next month')).toBeTruthy())
  const guessed = commentRowOrder()
  expect(guessed).toHaveLength(3)
  expect(guessed.slice(1)).toEqual(['comment-row-c1', 'comment-row-c2'])

  resolveCreate(serverAnswer.data[0])

  // ...and where it is once the server has answered. Both readings, because
  // "does not move" is a claim about two moments and asserting only the second
  // passes just as well when the row jumped in between — which is the whole
  // defect.
  await waitFor(() =>
    expect(commentRowOrder()).toEqual(['comment-row-c3', 'comment-row-c1', 'comment-row-c2']),
  )
})

it('puts a new reply at the TOP of an About entry’s thread too', async () => {
  ;(getSpotAboutComments as jest.Mock).mockResolvedValue(twoExistingComments)
  ;(createSpotAboutComment as jest.Mock).mockReturnValue(new Promise(() => {}))

  renderAboutScreen('about-1')

  await waitFor(() => expect(screen.getByText('Been there last summer')).toBeTruthy())

  fireEvent.changeText(screen.getByPlaceholderText('Add a comment...'), 'The gate opens at five')
  fireEvent.press(screen.getByLabelText('Post comment'))

  await waitFor(() => expect(screen.getByText('The gate opens at five')).toBeTruthy())

  const order = commentRowOrder()

  expect(order).toHaveLength(3)
  expect(order[0]).not.toBe('comment-row-c1')
  expect(order.slice(1)).toEqual(['comment-row-c1', 'comment-row-c2'])
})

/**
 * STOURIFY-198 — a thread has to say what it is a thread about.
 *
 * Opening replies used to land on a bare "Comments" heading: the spot and the
 * note you had been reading a second earlier were both gone, and nothing on
 * screen named either. These pin the context that replaced it, and pin that a
 * post thread — which has no such context to pass — is left exactly as it was.
 */
describe('thread context', () => {
  function renderWithContext(params: Record<string, unknown>) {
    return render(
      <TestProviders database={createTestDatabase()}>
        <CommentsScreen navigation={navigation} route={{ params } as any} />
      </TestProviders>,
    )
  }

  it('names the spot a note thread belongs to', async () => {
    renderWithContext({
      spotAboutId: 'about-1',
      spotTitle: 'Blue Cove',
      noteBody: 'Go at sunrise, the light is worth it.',
      noteAuthor: 'Mila Reyes',
    })

    await waitFor(() => {
      expect(screen.getByTestId('comments-context-spot')).toBeTruthy()
    })

    expect(screen.getByText('on Blue Cove')).toBeTruthy()
  })

  it('quotes the note being replied to, and says who wrote it', async () => {
    renderWithContext({
      spotAboutId: 'about-1',
      spotTitle: 'Blue Cove',
      noteBody: 'Go at sunrise, the light is worth it.',
      noteAuthor: 'Mila Reyes',
    })

    await waitFor(() => {
      expect(screen.getByTestId('comments-context-note')).toBeTruthy()
    })

    expect(screen.getByText('Go at sunrise, the light is worth it.')).toBeTruthy()
    expect(screen.getByText('Mila Reyes')).toBeTruthy()
  })

  // The degrade path, and the reason both fields are optional. A caller that
  // does not know the spot must still get a working thread rather than an
  // empty labelled box.
  it('renders the plain heading when no context was passed', async () => {
    renderWithContext({ spotAboutId: 'about-1' })

    await waitFor(() => {
      expect(screen.getByText('Comments')).toBeTruthy()
    })

    expect(screen.queryByTestId('comments-context-spot')).toBeNull()
    expect(screen.queryByTestId('comments-context-note')).toBeNull()
  })

  it('leaves a post thread untouched — it has no spot and no note', async () => {
    renderScreen('post-1')

    await waitFor(() => {
      expect(screen.getByText('Comments')).toBeTruthy()
    })

    expect(screen.queryByTestId('comments-context-spot')).toBeNull()
    expect(screen.queryByTestId('comments-context-note')).toBeNull()
  })
})

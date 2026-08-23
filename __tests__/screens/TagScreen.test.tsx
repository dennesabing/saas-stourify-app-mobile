import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import TagScreen from '@/features/tags/screens/TagScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/tags', () => ({
  getTag: jest.fn(),
  getPostsByTag: jest.fn(),
  getSpotsByTag: jest.fn(),
}))

import { getPostsByTag, getSpotsByTag, getTag } from '@/shared/api/tags'

const navigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() } as any
const route = { params: { slug: 'streetfood' } } as any

const TAG = { uuid: 'tag-1', slug: 'streetfood', name: 'StreetFood' }

const POST = {
  uuid: 'post-1',
  caption: 'great noodles #StreetFood',
  visibility: 'public',
  is_published: true,
  published_at: '2026-08-01T00:00:00Z',
  likes_count: 0,
  comments_count: 0,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  can: {},
}

const page = (data: unknown[]) => ({ data })

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <TagScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

/**
 * Five situations, five sentences.
 *
 * `SearchScreen` already carries the four-branch version of this and a long
 * comment about STOURIFY-59, where a failed request rendered as "no results" —
 * the screen said nothing matched when it had never found out. A tag page has a
 * fifth state that a search does not: the tag itself may not exist, which is a
 * `404` and a different sentence again.
 *
 * The assertions that actually protect the reader are the NEGATIVE ones. A test
 * asserting only that the error copy appears would pass a screen showing the
 * error copy AND "nothing tagged yet" together, which is the confusion this
 * whole family of cards is about.
 */
describe('TagScreen', () => {
  it('lists the content carrying the tag, headed by the spelling the author used', async () => {
    ;(getTag as jest.Mock).mockResolvedValue(TAG)
    ;(getPostsByTag as jest.Mock).mockResolvedValue(page([POST]))
    ;(getSpotsByTag as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    await waitFor(() => expect(screen.getByText('#StreetFood')).toBeTruthy())
    expect(screen.getByText(/great noodles/)).toBeTruthy()
  })

  it('says the tag is empty when it exists and nothing carries it', async () => {
    ;(getTag as jest.Mock).mockResolvedValue(TAG)
    ;(getPostsByTag as jest.Mock).mockResolvedValue(page([]))
    ;(getSpotsByTag as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    await waitFor(() => expect(screen.getByText(/Nothing tagged/i)).toBeTruthy())
    // Not a failure and not a missing tag — the reader is told the truth.
    expect(screen.queryByText(/Couldn't load/i)).toBeNull()
    expect(screen.queryByText(/No such tag/i)).toBeNull()
  })

  it('says it could not load, and does NOT say the tag is empty, when the request fails', async () => {
    ;(getTag as jest.Mock).mockResolvedValue(TAG)
    ;(getPostsByTag as jest.Mock).mockRejectedValue(new Error('network'))
    ;(getSpotsByTag as jest.Mock).mockRejectedValue(new Error('network'))

    renderScreen()

    await waitFor(() => expect(screen.getByText(/Couldn't load/i)).toBeTruthy())
    // The assertion this screen exists for. A reader told there is nothing here
    // goes and looks at something else; a reader told it failed tries again,
    // which is the one move that helps.
    expect(screen.queryByText(/Nothing tagged/i)).toBeNull()
  })

  it('offers a retry that asks again', async () => {
    ;(getTag as jest.Mock).mockResolvedValue(TAG)
    ;(getPostsByTag as jest.Mock).mockRejectedValue(new Error('network'))
    ;(getSpotsByTag as jest.Mock).mockRejectedValue(new Error('network'))

    renderScreen()

    await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())

    const before = (getPostsByTag as jest.Mock).mock.calls.length
    fireEvent.press(screen.getByText('Try again'))

    await waitFor(() =>
      expect((getPostsByTag as jest.Mock).mock.calls.length).toBeGreaterThan(before),
    )
  })

  it('says there is no such tag when the lookup 404s, distinguishably from both', async () => {
    ;(getTag as jest.Mock).mockRejectedValue({ response: { status: 404 } })
    ;(getPostsByTag as jest.Mock).mockResolvedValue(page([]))
    ;(getSpotsByTag as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    await waitFor(() => expect(screen.getByText(/No such tag/i)).toBeTruthy())
    expect(screen.queryByText(/Nothing tagged/i)).toBeNull()
    expect(screen.queryByText(/Couldn't load/i)).toBeNull()
  })

  it('distinguishes a lookup that failed for any other reason from a lookup that said 404', async () => {
    // A 500, a timeout, a dropped radio: the tag may well exist and we simply
    // could not ask. Saying "no such tag" here would be inventing an answer.
    ;(getTag as jest.Mock).mockRejectedValue({ response: { status: 500 } })
    ;(getPostsByTag as jest.Mock).mockResolvedValue(page([]))
    ;(getSpotsByTag as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    // Longer than the usual wait on purpose. The lookup does not give up on a
    // `500` the first time it hears one — it retries once, after a backoff of
    // about a second — so the screen is still legitimately trying when a
    // default one-second wait would have run out. It is the `404` above that
    // answers immediately, and that asymmetry is the behaviour under test.
    await waitFor(() => expect(screen.getByText(/Couldn't load/i)).toBeTruthy(), { timeout: 4000 })
    expect(screen.queryByText(/No such tag/i)).toBeNull()
  })

  /**
   * A tag page asks for two lists — posts and spots — and they can disagree
   * about whether they worked. Found on a real emulator: the spots listing was
   * slower than the app's fifteen-second patience and timed out while the posts
   * had already arrived, and the page threw the posts away to show an error.
   *
   * Ordering a starter and a main course does not mean going hungry because the
   * kitchen burnt the soup. Serve what arrived.
   */
  it('shows the half that arrived when the other half fails', async () => {
    ;(getTag as jest.Mock).mockResolvedValue(TAG)
    ;(getPostsByTag as jest.Mock).mockResolvedValue(page([POST]))
    ;(getSpotsByTag as jest.Mock).mockRejectedValue(new Error('timeout'))

    renderScreen()

    await waitFor(() => expect(screen.getByText(/great noodles/)).toBeTruthy())
    expect(screen.queryByText(/Couldn't load/i)).toBeNull()
  })

  it('still says it could not load when the failing half leaves nothing to show', async () => {
    // The rule the test above must not be allowed to break. With no rows on
    // screen and one request genuinely broken, "nothing tagged yet" would be
    // the same lie this whole screen exists to avoid.
    ;(getTag as jest.Mock).mockResolvedValue(TAG)
    ;(getPostsByTag as jest.Mock).mockResolvedValue(page([]))
    ;(getSpotsByTag as jest.Mock).mockRejectedValue(new Error('timeout'))

    renderScreen()

    await waitFor(() => expect(screen.getByText(/Couldn't load/i)).toBeTruthy())
    expect(screen.queryByText(/Nothing tagged/i)).toBeNull()
  })

  it('opens a post when its row is pressed', async () => {
    ;(getTag as jest.Mock).mockResolvedValue(TAG)
    ;(getPostsByTag as jest.Mock).mockResolvedValue(page([POST]))
    ;(getSpotsByTag as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    await waitFor(() => expect(screen.getByText(/great noodles/)).toBeTruthy())
    fireEvent.press(screen.getByText(/great noodles/))

    expect(navigation.navigate).toHaveBeenCalledWith('PostDetail', { postId: 'post-1' })
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import BlockedAccountsScreen from '@/features/profile/screens/BlockedAccountsScreen'
import { ThemeProvider } from '@/theme/ThemeProvider'

/**
 * The Blocked accounts list (STOURIFY-37).
 *
 * This screen exists because the other-user profile cannot host Unblock: once a
 * block stands, `GET /profiles/{them}` answers 403 for the blocker too, so the
 * screen a "Block / Unblock" toggle would live on refuses to load. `GET /blocks`
 * is the only surface that can list them.
 *
 * The assertion that matters most is which uuid Unblock sends. `DELETE /blocks`
 * addresses the BLOCK row, and sending the user's uuid instead 404s — the same
 * class of bug STOURIFY-35 fixed on the unfollow path.
 */

jest.mock('@/shared/api/blocks', () => ({
  getBlocks: jest.fn(),
  unblockUser: jest.fn(),
}))

import { getBlocks, unblockUser } from '@/shared/api/blocks'

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function page(rows: unknown[]) {
  return { data: rows, links: {}, meta: { current_page: 1, last_page: 1, total: rows.length } }
}

function blockRow(over: Record<string, unknown> = {}) {
  return {
    uuid: 'block-1',
    blocked: {
      uuid: 'user-other',
      name: 'Grace Santos',
      username: 'santos_grace',
      bio: null,
      is_private: false,
    },
    created_at: null,
    ...over,
  }
}

function renderScreen(queryClient?: QueryClient) {
  const qc = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider scheme="light">
        <QueryClientProvider client={qc}>
          <BlockedAccountsScreen navigation={navigation} route={{ params: undefined } as any} />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(unblockUser as jest.Mock).mockResolvedValue(undefined)
})

test('the list names everyone I have blocked', async () => {
  ;(getBlocks as jest.Mock).mockResolvedValue(page([blockRow()]))

  renderScreen()

  expect(await screen.findByText('Grace Santos')).toBeTruthy()
  expect(screen.getByText('@santos_grace')).toBeTruthy()
})

test('blocking nobody reads as an empty list, not as a broken screen', async () => {
  ;(getBlocks as jest.Mock).mockResolvedValue(page([]))

  renderScreen()

  expect(await screen.findByText(/have not blocked anyone/i)).toBeTruthy()
})

test('Unblock addresses the block row uuid, never the user uuid', async () => {
  ;(getBlocks as jest.Mock).mockResolvedValue(page([blockRow()]))

  renderScreen()

  fireEvent.press(await screen.findByLabelText('Unblock Grace Santos'))

  await waitFor(() => expect(unblockUser).toHaveBeenCalledWith('block-1'))
  expect(unblockUser).not.toHaveBeenCalledWith('user-other')
})

/**
 * The three situations this screen used to answer with one sentence
 * (STOURIFY-87).
 *
 * "You have not blocked anyone" is safety copy, and it is the worst sentence in
 * this family to get wrong: somebody opening this screen to check that a block
 * still stands was told it does not, when in fact the list simply never
 * arrived. The 15-second timeout in `shared/api/client.ts` makes that routine.
 *
 * Each case asserts the presence of its own copy AND the absence of the
 * others', so two states cannot collapse into one branch and still pass.
 */
describe('a failed blocked-list fetch is not an empty blocked list', () => {
  test('says the request failed, and offers a retry that re-runs the query', async () => {
    ;(getBlocks as jest.Mock).mockRejectedValue(new Error('timeout of 15000ms exceeded'))

    renderScreen()

    expect(await screen.findByText("Couldn't load your blocked list")).toBeTruthy()
    expect(screen.queryByText(/have not blocked anyone/i)).toBeNull()
    expect(screen.queryByText('Nobody blocked')).toBeNull()

    expect(getBlocks).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('Try again'))

    await waitFor(() => expect(getBlocks).toHaveBeenCalledTimes(2))
  })

  test('still says nobody blocked when the request succeeds with no rows', async () => {
    ;(getBlocks as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    expect(await screen.findByText('Nobody blocked')).toBeTruthy()
    expect(screen.queryByText("Couldn't load your blocked list")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  /**
   * This is also the case that proves the loading check was actually moved
   * INTO `ListEmptyComponent` rather than an error branch being bolted on
   * beside it where it stood.
   *
   * Until STOURIFY-87 this screen decided **above** the `FlatList` whether to
   * render the list at all, so during a cold load the list did not exist —
   * only a pair of placeholders where it should have been. The list being
   * mounted throughout is the visible difference the unwind makes, and it is
   * what makes the placement rule enforceable here: a branch that can hide the
   * whole list is one edit away from hiding rows somebody could still read.
   */
  test('shows the loading placeholders inside the list, and claims neither, while the request is in flight', async () => {
    // Never settles, so the screen stays in its first-load state.
    ;(getBlocks as jest.Mock).mockReturnValue(new Promise(() => {}))

    renderScreen()

    // `Skeleton` announces itself as "Loading"; this screen renders two.
    await waitFor(() => expect(screen.getAllByLabelText('Loading')).toHaveLength(2))
    // The list itself is still there, with the placeholders as its empty
    // component — it is not replaced by them.
    expect(screen.getByTestId('blocked-accounts-list')).toBeTruthy()
    expect(screen.queryByText('Nobody blocked')).toBeNull()
    expect(screen.queryByText("Couldn't load your blocked list")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  /**
   * Content wins over an error: the failure branch lives inside
   * `ListEmptyComponent`, which never renders while the list holds rows.
   *
   * Stated honestly, this case passes both before and after the unwind —
   * `isLoading` is false once anything is cached, so today's hoisted check is
   * not reached. It is here as a regression guard rather than as proof: it is
   * the assertion that fails the day somebody "tidies up" by lifting the
   * `isError` branch above the list, which is the mistake this whole family of
   * cards exists to prevent and the one no ordinary use would ever reveal.
   */
  test('keeps showing the blocked list when a later fetch fails', async () => {
    ;(getBlocks as jest.Mock).mockRejectedValue(new Error('offline'))

    const seeded = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    seeded.setQueryData(['blocks'], page([blockRow()]))

    renderScreen(seeded)

    await waitFor(() => expect(getBlocks).toHaveBeenCalled())

    expect(screen.getByText('Grace Santos')).toBeTruthy()
    expect(screen.queryByText("Couldn't load your blocked list")).toBeNull()
    expect(screen.queryByText('Nobody blocked')).toBeNull()
  })
})

test('a row whose explorer relation never loaded still renders instead of crashing', async () => {
  // `blocked` is a `whenLoaded` relation on the resource. The controller loads
  // it on every path today, but a row that arrives without it must not take the
  // screen down — the same defensive rule PostCard follows for its author.
  ;(getBlocks as jest.Mock).mockResolvedValue(page([blockRow({ blocked: undefined })]))

  renderScreen()

  expect(await screen.findByText(/unknown explorer/i)).toBeTruthy()
})

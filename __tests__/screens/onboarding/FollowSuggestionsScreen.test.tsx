import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import FollowSuggestionsScreen from '@/features/onboarding/screens/FollowSuggestionsScreen'
import { useOnboardingStore } from '@/shared/store/onboarding'
import { createTestDatabase } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'
import { trackQueryClient } from '../../support/queryClients'

jest.mock('@/shared/api/discover', () => ({ searchPeople: jest.fn() }))
jest.mock('@/shared/api/follows', () => ({ follow: jest.fn(async () => ({})) }))

import { searchPeople } from '@/shared/api/discover'
import { follow } from '@/shared/api/follows'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

beforeEach(() => {
  jest.clearAllMocks()
  useOnboardingStore.setState({ shouldOnboard: true, completed: false })
})

function renderScreen(queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <FollowSuggestionsScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )
}

/**
 * The copy each of the four no-rows states shows, named once so every test can
 * assert the absence of the other three. Two states sharing one branch would
 * satisfy a presence check on its own and would not be a fix.
 */
const PROMPT = 'Search for people'
const SEARCHING = 'Searching…'
const FAILED = "Couldn't search for people"
const NOBODY_FOUND = 'No one found'

const ANA = {
  uuid: 'p1',
  user_uuid: 'user-1',
  username: 'ana',
  name: 'Ana Martinez',
  bio: null,
  is_private: false,
}

const ONE_PERSON = {
  data: [ANA],
  links: {},
  meta: { current_page: 1, last_page: 1, total: 1 },
}

function type(text: string) {
  fireEvent.changeText(screen.getByPlaceholderText('Search people'), text)
}

it('is search-backed, not a claimed recommendation surface', () => {
  renderScreen()

  expect(screen.queryByText(/suggested for you/i)).toBeNull()
  expect(screen.getByPlaceholderText('Search people')).toBeTruthy()
})

it('searches people on typing and shows a Follow button per hit', async () => {
  ;(searchPeople as jest.Mock).mockResolvedValue(ONE_PERSON)

  renderScreen()

  type('ana')

  await waitFor(() => expect(screen.getByText('Ana Martinez')).toBeTruthy())
  expect(searchPeople).toHaveBeenCalledWith('ana')

  fireEvent.press(screen.getByText('Follow'))

  await waitFor(() => expect(follow).toHaveBeenCalledWith('user-1'))
})

it('Skip completes onboarding', async () => {
  renderScreen()

  fireEvent.press(screen.getByText('Skip'))

  await waitFor(() => {
    expect(useOnboardingStore.getState().completed).toBe(true)
  })
})

/**
 * The gate, and the trap this whole screen is built on. With `enabled: false`,
 * React Query v5 reports `isPending: true` and `isFetching: false` — so a search
 * that was never sent looks *settled*. Ask anything before the gate and the
 * screen reports an outcome for a search it never ran.
 */
it('prompts rather than claiming nobody matched before anything was searched', () => {
  renderScreen()

  expect(screen.getByText(PROMPT)).toBeTruthy()
  expect(screen.queryByText(NOBODY_FOUND)).toBeNull()
  expect(screen.queryByText(FAILED)).toBeNull()
  expect(screen.queryByText(SEARCHING)).toBeNull()
})

/**
 * The gate's other half. The test above is a screen nobody has touched; this is
 * a reader one keystroke in — still unasked, and still owed the same sentence.
 */
it('keeps prompting for a query too short to send, and sends nothing', async () => {
  renderScreen()
  type('a')

  await new Promise((resolve) => setTimeout(resolve, 600))

  expect(searchPeople).not.toHaveBeenCalled()
  expect(screen.getByText(PROMPT)).toBeTruthy()
  expect(screen.queryByText(NOBODY_FOUND)).toBeNull()
  expect(screen.queryByText(FAILED)).toBeNull()
  expect(screen.queryByText(SEARCHING)).toBeNull()
})

/**
 * A blank frame for the length of the request is indistinguishable from a
 * search that found nobody — which on an emulator, where the round trip takes
 * seconds, is exactly how it read.
 */
it('says it is searching while the request is in flight', async () => {
  ;(searchPeople as jest.Mock).mockReturnValue(new Promise(() => {}))

  renderScreen()
  type('ana')

  await waitFor(() => expect(screen.getByText(SEARCHING)).toBeTruthy(), { timeout: 3000 })
  expect(screen.queryByText(NOBODY_FOUND)).toBeNull()
  expect(screen.queryByText(FAILED)).toBeNull()
  expect(screen.queryByText(PROMPT)).toBeNull()
})

/**
 * The card itself. A search that never got an answer used to report that nobody
 * matched — a shop assistant who could not open the stockroom door telling you
 * the item is out of stock, said to somebody three minutes into their first
 * session. The absence assertion is the half that matters: a screen stacking
 * both messages would satisfy the presence check alone and would not be a fix.
 */
it('says the search failed rather than that nobody matched', async () => {
  ;(searchPeople as jest.Mock).mockRejectedValue(new Error('Network request failed'))

  renderScreen()
  type('ana')

  await waitFor(() => expect(screen.getByText(FAILED)).toBeTruthy(), { timeout: 3000 })
  expect(screen.getByText('Try again')).toBeTruthy()
  expect(screen.queryByText(NOBODY_FOUND)).toBeNull()
  expect(screen.queryByText(PROMPT)).toBeNull()
})

it('runs the search again when the failure state is retried', async () => {
  ;(searchPeople as jest.Mock).mockRejectedValue(new Error('Network request failed'))

  renderScreen()
  type('ana')

  await waitFor(() => expect(screen.getByText(FAILED)).toBeTruthy(), { timeout: 3000 })
  const callsBefore = (searchPeople as jest.Mock).mock.calls.length

  fireEvent.press(screen.getByText('Try again'))

  await waitFor(
    () => expect((searchPeople as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore),
    { timeout: 3000 },
  )
})

it('reports a search that matched nobody as empty, in the words it always used', async () => {
  ;(searchPeople as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()
  type('zzzzz')

  await waitFor(() => expect(screen.getByText(NOBODY_FOUND)).toBeTruthy(), { timeout: 3000 })
  expect(screen.getByText('Try a different name or handle')).toBeTruthy()
  expect(screen.queryByText(FAILED)).toBeNull()
  expect(screen.queryByText(PROMPT)).toBeNull()
})

/**
 * Why the failure branch lives inside `ListEmptyComponent` and not above the
 * list. React Query keeps serving the rows it already holds while a later fetch
 * fails, and a no-rows branch cannot run while there are rows — so people the
 * reader is part-way through following can never be covered by an error message.
 * Hoisting the check would delete that and never once show that it had, because
 * the branch is unreachable while the network is up.
 *
 * Worth saying plainly what this does NOT prove, because its name suggests more
 * than it delivers (found on the sibling card STOURIFY-87): a hoisted *loading*
 * check would still pass here, since anything cached makes `isLoading` false and
 * the hoisted branch is never reached. This is a regression guard on the error
 * branch's placement, not a proof about loading.
 */
it('keeps showing people already found when a later request fails', async () => {
  // `gcTime` is deliberately not the suite's usual `0`: a cache entry with no
  // observer yet is collected the instant it is written, so a seeded search
  // would be gone before the screen asked for it. The cost is a collection
  // timer that outlives the test — hence the `clear()` below.
  const client = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  client.setQueryData(['discover-people', 'ana'], ONE_PERSON)
  ;(searchPeople as jest.Mock).mockRejectedValue(new Error('Network request failed'))

  const { unmount } = renderScreen(client)

  try {
    type('ana')

    await waitFor(() => expect(screen.getByText('Ana Martinez')).toBeTruthy(), { timeout: 3000 })
    await waitFor(() => expect(searchPeople).toHaveBeenCalled(), { timeout: 3000 })

    expect(screen.getByText('Ana Martinez')).toBeTruthy()
    expect(screen.queryByText(FAILED)).toBeNull()
    expect(screen.queryByText(NOBODY_FOUND)).toBeNull()
  } finally {
    unmount()
    client.clear()
  }
})

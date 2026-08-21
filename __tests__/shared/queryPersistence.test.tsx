import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, useQuery } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { act, render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import {
  createQueryClient,
  PERSIST_BUSTER,
  PERSIST_KEY,
  PERSIST_MAX_AGE_MS,
  persistOptions,
  shouldPersistQuery,
} from '@/shared/queryClient'

const PROBE_KEY = ['feed', 'following']

function Probe() {
  const { data } = useQuery({
    queryKey: PROBE_KEY,
    // The network is "off": the fetcher always fails. Anything rendered can
    // only have come from the persisted cache.
    queryFn: async () => {
      throw new Error('offline')
    },
    retry: false,
  })

  return <Text testID="probe">{data ?? 'no-data'}</Text>
}

/**
 * One launch of the app, from a cold process.
 *
 * A cold start means nothing survives in memory, so each launch gets its OWN
 * cache — reusing one between launches would carry the answer across in memory
 * and the test would pass without storage having done anything. The persister
 * and its options are the app's real ones, shared with `App.tsx`.
 */
function ColdStart({ client }: { client: QueryClient }) {
  return (
    <PersistQueryClientProvider client={client} persistOptions={persistOptions}>
      <Probe />
    </PersistQueryClientProvider>
  )
}

/**
 * Write a saved copy to storage the way a successful online session would have
 * left it behind.
 *
 * It goes in with a plain `setItem` rather than through the persister, and that
 * is deliberate. The persister writes at most once a second and will silently
 * drop a call made while another is already queued — perfectly sensible for an
 * app, and poison for a test, because the seed for THIS test can be swallowed by
 * a write still pending from the PREVIOUS one. Seeding directly makes the
 * starting state a fact rather than a race. The shape written here is exactly
 * what the persister serialises: a buster, a timestamp, and the dehydrated
 * queries.
 */
async function seedSavedCopy(value: string) {
  const online = new QueryClient()
  online.setQueryData(PROBE_KEY, value)

  await AsyncStorage.setItem(
    PERSIST_KEY,
    JSON.stringify({
      buster: PERSIST_BUSTER,
      timestamp: Date.now(),
      clientState: {
        mutations: [],
        queries: online
          .getQueryCache()
          .getAll()
          .map((query) => ({ queryKey: query.queryKey, queryHash: query.queryHash, state: query.state })),
      },
    }),
  )
}

/**
 * The persister writes at most once a second (`throttleTime`, the library's
 * default). So a launch has to be left running longer than that before we can
 * say anything about what it left behind — unmounting sooner measures the
 * throttle, not the rule under test.
 */
async function settleTheThrottledWrite() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1_500))
  })
}

beforeEach(async () => {
  // Drain anything the previous test left queued BEFORE clearing, or its write
  // lands afterwards and quietly becomes this test's starting state.
  await settleTheThrottledWrite()
  await AsyncStorage.clear()
})

it('exposes a max age and a buster so a stale cache cannot outlive a release', () => {
  expect(PERSIST_MAX_AGE_MS).toBeGreaterThan(0)
  expect(typeof PERSIST_BUSTER).toBe('string')
  expect(PERSIST_BUSTER.length).toBeGreaterThan(0)
})

it('renders a query from the persisted cache with the fetcher failing', async () => {
  await seedSavedCopy('from-cache')

  const client = createQueryClient()
  render(<ColdStart client={client} />)

  await waitFor(() => {
    expect(screen.getByTestId('probe')).toHaveTextContent('from-cache')
  })
})

describe('shouldPersistQuery — what is worth writing to the phone', () => {
  it('keeps a request whose last attempt succeeded', () => {
    expect(shouldPersistQuery({ state: { status: 'success', data: 'a profile' } })).toBe(true)
  })

  it('keeps a request that is still holding data, even though its last refresh failed', () => {
    // This is the whole fix. The library's own default answers `false` here,
    // and answering `false` is what empties the drawer on the second restart.
    expect(shouldPersistQuery({ state: { status: 'error', data: 'a profile' } })).toBe(true)
  })

  it('drops a request that has never successfully loaded', () => {
    // Recorded as an ASSUMPTION on STOURIFY-121: a saved failure is not a saved
    // copy of anything, so there is nothing for a screen to draw from it.
    expect(shouldPersistQuery({ state: { status: 'error', data: undefined } })).toBe(false)
  })
})

it('keeps a saved copy across THREE offline cold starts, not just the first', async () => {
  // The last moment there was signal.
  await seedSavedCopy('from-server')

  // Then the signal goes. Three launches in a row with the fetcher always
  // failing: launch #1 passed before this fix, #2 and #3 are the regression.
  for (const launch of [1, 2, 3]) {
    const client = createQueryClient()
    const view = render(<ColdStart client={client} />)

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('from-server')
    }, { timeout: 5_000 })

    // Let the doomed refresh fail, so this launch ends holding data in an
    // `error` state — the exact shape the old rule refused to write back.
    await waitFor(() => {
      expect(client.getQueryState(PROBE_KEY)?.status).toBe('error')
    })
    await settleTheThrottledWrite()

    view.unmount()

    // What the next launch will find in the drawer.
    expect(await AsyncStorage.getItem(PERSIST_KEY)).toContain('from-server')
  }
})

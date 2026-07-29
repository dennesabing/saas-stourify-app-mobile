import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useQuery } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import { asyncStoragePersister, PERSIST_BUSTER, PERSIST_MAX_AGE_MS } from '@/shared/queryClient'

function Probe() {
  const { data } = useQuery({
    queryKey: ['feed', 'following'],
    // The network is "off": the fetcher always fails. Anything rendered can
    // only have come from the persisted cache.
    queryFn: async () => {
      throw new Error('offline')
    },
  })

  return <Text testID="probe">{data ?? 'no-data'}</Text>
}

beforeEach(async () => {
  await AsyncStorage.clear()
})

it('exposes a max age and a buster so a stale cache cannot outlive a release', () => {
  expect(PERSIST_MAX_AGE_MS).toBeGreaterThan(0)
  expect(typeof PERSIST_BUSTER).toBe('string')
  expect(PERSIST_BUSTER.length).toBeGreaterThan(0)
})

it('renders a query from the persisted cache with the fetcher failing', async () => {
  // Seed the persisted cache exactly as the persister would have written it.
  const seeded = new QueryClient()
  seeded.setQueryData(['feed', 'following'], 'from-cache')

  await asyncStoragePersister.persistClient({
    buster: PERSIST_BUSTER,
    timestamp: Date.now(),
    clientState: {
      mutations: [],
      queries: seeded
        .getQueryCache()
        .getAll()
        .map((query) => ({
          queryKey: query.queryKey,
          queryHash: query.queryHash,
          state: query.state,
        })),
    },
  } as any)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })

  render(
    <PersistQueryClientProvider
      client={client}
      persistOptions={{ persister: asyncStoragePersister, maxAge: PERSIST_MAX_AGE_MS, buster: PERSIST_BUSTER }}
    >
      <Probe />
    </PersistQueryClientProvider>,
  )

  await waitFor(() => {
    expect(screen.getByTestId('probe')).toHaveTextContent('from-cache')
  })
})

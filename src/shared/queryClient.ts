import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import appJson from '../../app.json'

/**
 * How long a persisted cache may be served before it is discarded wholesale.
 *
 * 24h: long enough that a day away from signal still opens to a populated app,
 * short enough that nobody is reading week-old prices or a stale follow graph.
 */
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Bumping the app version invalidates every persisted cache.
 *
 * Without this, a release that changes an API resource's shape would rehydrate
 * yesterday's differently-shaped objects into today's components — a crash that
 * only reproduces on upgrade, never on a fresh install.
 */
export const PERSIST_BUSTER = String((appJson as { expo?: { version?: string } }).expo?.version ?? '0')

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'stourify_query_cache',
})

/**
 * The app's single React Query cache, hoisted out of `App.tsx` so `signOut`
 * (`src/sync/session.ts`) can reach it the same way it reaches `getDatabase()`
 * — a module-level singleton with a stable identity, not a value only a
 * component's `useState` closure holds.
 *
 * `App.tsx`'s `PersistQueryClientProvider` is given this instance directly
 * instead of constructing its own; there is exactly one `QueryClient` for the
 * app's lifetime either way, this just makes it reachable from outside React.
 *
 * `gcTime` is raised to `PERSIST_MAX_AGE_MS`: a persisted entry is only useful
 * if it survives long enough in memory for the persister to write it back out
 * before garbage collection claims it.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 0, retry: 1, gcTime: PERSIST_MAX_AGE_MS } },
})

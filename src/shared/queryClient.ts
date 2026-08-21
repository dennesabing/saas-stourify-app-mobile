import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'
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

/**
 * The one key in the phone's key-value store that the whole cache lives under.
 *
 * Named rather than inlined so a test can look at what the app actually wrote,
 * instead of repeating the string and quietly checking a key nobody uses.
 */
export const PERSIST_KEY = 'stourify_query_cache'

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: PERSIST_KEY,
})

/**
 * Builds a cache configured the way the app configures its own.
 *
 * The app only ever needs one (below), so this exists for the offline tests,
 * which have to model a *cold start* — a launch where nothing survives in
 * memory and everything has to be read back from storage. Reusing one cache
 * across two simulated launches would carry the answer over in memory, and the
 * test would pass without storage having done anything at all.
 *
 * `gcTime` is raised to `PERSIST_MAX_AGE_MS`: a persisted entry is only useful
 * if it survives long enough in memory for the persister to write it back out
 * before garbage collection claims it.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 0, retry: 1, gcTime: PERSIST_MAX_AGE_MS } },
  })
}

/**
 * The app's single React Query cache, hoisted out of `App.tsx` so `signOut`
 * (`src/sync/session.ts`) can reach it the same way it reaches `getDatabase()`
 * — a module-level singleton with a stable identity, not a value only a
 * component's `useState` closure holds.
 *
 * `App.tsx`'s `PersistQueryClientProvider` is given this instance directly
 * instead of constructing its own; there is exactly one `QueryClient` for the
 * app's lifetime either way, this just makes it reachable from outside React.
 */
export const queryClient = createQueryClient()

/**
 * The smallest shape this rule reads. A real `Query` satisfies it, and so does
 * a plain object in a test — which is the point: a rule you cannot state an
 * example of is a rule nobody can check.
 */
interface PersistableQuery {
  state: { status: string; data: unknown }
}

/**
 * Which cached requests are worth writing to the phone.
 *
 * Picture a shop that photocopies head office's price list. The rule it used to
 * follow at closing time was *"file today's list, but only if we actually got
 * through to head office today."* On the first day the phone line is dead that
 * is harmless — yesterday's copy is still in the drawer. But nothing gets filed
 * that evening, because there was no call, so on the second dead-phone day the
 * drawer is empty and stays empty until the line comes back. The rule below is
 * the replacement: *file the copy if we are holding one worth keeping, whether
 * or not today's call got through.*
 *
 * Mechanically: TanStack Query labels a request by its MOST RECENT attempt, so
 * a request still holding good data from an earlier success sits in `error`
 * state the moment one refresh fails. The library's own
 * `defaultShouldDehydrateQuery` keeps only `success`, and the persister rewrites
 * the ENTIRE saved file on every cache change rather than editing entries in
 * place — so a filter that rejects an entry does not merely skip it, it deletes
 * it. That combination is what made a saved copy survive exactly one offline
 * cold start and no more (STOURIFY-121).
 *
 * A request that has only ever failed carries no data, so it is still dropped:
 * a saved failure is not a saved copy of anything, and rehydrating one would
 * open a screen already showing an error it inherited from a previous run
 * instead of trying to load.
 */
export function shouldPersistQuery(query: PersistableQuery): boolean {
  return query.state.status === 'success' || query.state.data !== undefined
}

/**
 * The single configuration `App.tsx` hands to `PersistQueryClientProvider`.
 *
 * It is exported rather than written inline at the call site so the app and the
 * test that guards it read the same object. The rule above only holds if there
 * is exactly one copy of it — two copies of a fact eventually disagree, and
 * nothing says which one the phone is actually running.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: asyncStoragePersister,
  maxAge: PERSIST_MAX_AGE_MS,
  buster: PERSIST_BUSTER,
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
}

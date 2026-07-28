import { QueryClient } from '@tanstack/react-query'

/**
 * The app's single React Query cache, hoisted out of `App.tsx` so `signOut`
 * (`src/sync/session.ts`) can reach it the same way it reaches `getDatabase()`
 * — a module-level singleton with a stable identity, not a value only a
 * component's `useState` closure holds.
 *
 * `App.tsx`'s `QueryClientProvider` is given this instance directly instead of
 * constructing its own; there is exactly one `QueryClient` for the app's
 * lifetime either way, this just makes it reachable from outside React.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 0, retry: 1 } },
})

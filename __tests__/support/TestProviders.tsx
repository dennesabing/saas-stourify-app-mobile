import type { ReactNode } from 'react'
import type { Database } from '@nozbe/watermelondb'
import { DatabaseProvider } from '@nozbe/watermelondb/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import { ThemeProvider } from '@/theme/ThemeProvider'

interface Props {
  database: Database
  children: ReactNode
}

/**
 * A fixed frame + inset set for `SafeAreaProvider`'s `initialMetrics`.
 *
 * Without `initialMetrics`, `useSafeAreaInsets()` (used by `TabBar.tsx`) and
 * `SafeAreaView` (used by `DiscoverScreen`, `ActivityScreen`, `CreateMenuScreen`,
 * `ThemeGalleryScreen`) resolve insets from a native measurement pass that
 * never happens under jest, so tests would depend on an unmeasured, effectively
 * random layout. A fixed frame makes every test deterministic.
 */
const TEST_SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

/**
 * The provider stack every screen test needs.
 *
 * Order matches `App.tsx`: `SafeAreaProvider > ThemeProvider > QueryClientProvider`.
 * `retry: false` matters: React Query's default retry turns a deliberately
 * failing request into a multi-second test, and the failure is the assertion.
 * The theme is pinned to light so a snapshot never depends on the host OS
 * appearance.
 */
export function TestProviders({ database, children }: Props) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return (
    <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
      <ThemeProvider scheme="light">
        <QueryClientProvider client={queryClient}>
          <DatabaseProvider database={database}>{children}</DatabaseProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

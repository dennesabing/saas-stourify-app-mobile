import type { ReactNode } from 'react'
import type { Database } from '@nozbe/watermelondb'
import { DatabaseProvider } from '@nozbe/watermelondb/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/theme/ThemeProvider'

interface Props {
  database: Database
  children: ReactNode
}

/**
 * The provider stack every screen test needs.
 *
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
    <DatabaseProvider database={database}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider scheme="light">{children}</ThemeProvider>
      </QueryClientProvider>
    </DatabaseProvider>
  )
}

import { useEffect, useState } from 'react'
import { DatabaseProvider } from '@nozbe/watermelondb/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { getDatabase } from '@/db'
import RootNavigator from '@/shared/navigation/RootNavigator'
import { startSyncScheduler } from '@/sync/scheduler'
import { installSyncSessionHandlers } from '@/sync/session'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { useAppFonts } from '@/theme/useAppFonts'
import { queryClient } from '@/shared/queryClient'

export default function App() {
  const [database] = useState(() => getDatabase())

  // Deliberately not gating render on this: a blocked splash on a slow device
  // is worse than one frame of system font. See useAppFonts().
  useAppFonts()

  // The session handlers wipe the local database on logout; the scheduler owns
  // the four drain triggers. Both are process-level, so they mount once here
  // rather than on any screen.
  useEffect(() => {
    installSyncSessionHandlers(database)
    return startSyncScheduler(database)
  }, [database])

  return (
    <SafeAreaProvider>
      <DatabaseProvider database={database}>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="auto" />
            <RootNavigator />
          </QueryClientProvider>
        </ThemeProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  )
}

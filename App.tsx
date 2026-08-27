import { useEffect, useState } from 'react'
import { DatabaseProvider } from '@nozbe/watermelondb/react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { getDatabase } from '@/db'
import RootNavigator from '@/shared/navigation/RootNavigator'
import { startSyncScheduler } from '@/sync/scheduler'
import { installSyncSessionHandlers } from '@/sync/session'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { useAppFonts } from '@/theme/useAppFonts'
import { persistOptions, queryClient } from '@/shared/queryClient'
import UpdateRequiredScreen from '@/shared/update/UpdateRequiredScreen'
import { useMinimumVersion } from '@/shared/update/useMinimumVersion'

export default function App() {
  const [database] = useState(() => getDatabase())

  // Whether the published release channel still permits this build. It starts
  // permissive and can only turn blocking, so nothing here delays the launch —
  // see useMinimumVersion() for why that direction is the safe one.
  const version = useMinimumVersion()

  // Deliberately not gating render on this: a blocked splash on a slow device
  // is worse than one frame of system font. See useAppFonts().
  useAppFonts()

  // The session handlers wipe the local database on logout; the scheduler owns
  // the four drain triggers. Both are process-level, so they mount once here
  // rather than on any screen.
  useEffect(() => {
    const stop = startSyncScheduler(database)
    installSyncSessionHandlers(database, stop)
    return stop
  }, [database])

  return (
    <SafeAreaProvider>
      <DatabaseProvider database={database}>
        <ThemeProvider>
          {!version.supported ? (
            // Everything else is deliberately unreachable from here. A build
            // below the channel's floor cannot do anything useful, so offering
            // a way past this would only lead into the silent dead app this
            // screen exists to replace (STOURIFY-190).
            <>
              <StatusBar style="auto" />
              <UpdateRequiredScreen
                downloadUrl={version.downloadUrl}
                message={version.message}
                latestVersion={version.latestVersion}
              />
            </>
          ) : (
            <>
              {/*
                The persistence settings live in `@/shared/queryClient` rather
                than inline here, so the rule deciding what survives a restart
                has one home that a test can read too. See `shouldPersistQuery`.
              */}
              <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
                <StatusBar style="auto" />
                <RootNavigator />
              </PersistQueryClientProvider>
            </>
          )}
        </ThemeProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  )
}

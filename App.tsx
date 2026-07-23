import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import RootNavigator from '@/shared/navigation/RootNavigator'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { useAppFonts } from '@/theme/useAppFonts'

export default function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 0, retry: 1 } } })
  )

  // Deliberately not gating render on this: a blocked splash on a slow device
  // is worse than one frame of system font. See useAppFonts().
  useAppFonts()

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <RootNavigator />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

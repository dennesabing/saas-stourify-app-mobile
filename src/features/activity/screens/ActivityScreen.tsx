import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { EmptyState } from '@/shared/components/ui'
import type { ActivityStackParamList } from '@/shared/navigation/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<ActivityStackParamList, 'Activity'>

/**
 * Placeholder for the Activity centre — grouped, typed rows with inline
 * follow-back. Built in M3 alongside the feed it pulls people back into.
 */
export default function ActivityScreen(_props: Props) {
  const theme = useTheme()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <EmptyState
        icon="🔔"
        title="Nothing yet"
        subtitle="Follows, likes, comments and badge unlocks will land here."
      />
    </SafeAreaView>
  )
}

import { View } from 'react-native'
import { Text } from '@/shared/components/ui'
import { formatRelativeTime } from '@/shared/utils/relativeTime'
import { useSyncStatusStore, type SyncPhase } from '@/sync/status'
import { useTheme } from '@/theme/ThemeProvider'

export type BannerTone = 'success' | 'primary' | 'accent' | 'muted'

export interface BannerState {
  tone: BannerTone
  icon: string
  title: string
  subtitle: string
}

export interface BannerInput {
  phase: SyncPhase
  offline: boolean
  pending: number
  failed: number
  lastSyncedAt: number | null
  now: number
}

function changes(count: number): string {
  return `${count} change${count === 1 ? '' : 's'}`
}

function lastSyncedLine(lastSyncedAt: number | null, now: number): string {
  return lastSyncedAt === null
    ? 'Not synced yet'
    : `Last synced ${formatRelativeTime(lastSyncedAt, now)}`
}

/**
 * First match wins, and the order is deliberate.
 *
 * `offline` outranks a pending queue because a queue while offline is the system
 * working as designed — showing it as a problem would train the user to ignore
 * the one banner that does mean something. Failures outrank a plain queue
 * because only they need an action.
 */
export function resolveBannerState(input: BannerInput): BannerState {
  const { phase, offline, pending, failed, lastSyncedAt, now } = input

  if (phase !== 'idle') {
    return {
      tone: 'primary',
      icon: '🔄',
      title: 'Syncing…',
      subtitle: pending > 0 ? `${changes(pending)} to send` : 'Checking for updates',
    }
  }

  if (offline) {
    return {
      tone: 'muted',
      icon: '📴',
      title: "You're offline",
      subtitle:
        pending > 0
          ? `${changes(pending)} waiting · they'll send when you reconnect`
          : 'Nothing waiting to send',
    }
  }

  if (failed > 0) {
    return {
      tone: 'accent',
      icon: '⚠️',
      title: `${changes(failed)} need${failed === 1 ? 's' : ''} your attention`,
      subtitle: `${pending} waiting · ${lastSyncedLine(lastSyncedAt, now).toLowerCase()}`,
    }
  }

  if (pending > 0) {
    return {
      tone: 'primary',
      icon: '⬆️',
      title: `${changes(pending)} waiting to sync`,
      subtitle: lastSyncedLine(lastSyncedAt, now),
    }
  }

  return {
    tone: 'success',
    icon: '✅',
    title: 'All changes synced',
    subtitle: lastSyncedLine(lastSyncedAt, now),
  }
}

interface Props {
  pending: number
  failed: number
}

export default function SyncBanner({ pending, failed }: Props) {
  const theme = useTheme()
  const phase = useSyncStatusStore((state) => state.phase)
  const offline = useSyncStatusStore((state) => state.offline)
  const lastSyncedAt = useSyncStatusStore((state) => state.lastSyncedAt)

  const state = resolveBannerState({
    phase,
    offline,
    pending,
    failed,
    lastSyncedAt,
    now: Date.now(),
  })

  const background: Record<BannerTone, string> = {
    success: theme.colors.success,
    primary: theme.colors.primary,
    accent: theme.colors.accent,
    muted: theme.colors.button,
  }

  return (
    <View
      accessibilityRole="summary"
      style={{
        backgroundColor: background[state.tone],
        borderRadius: theme.radius.card,
        padding: theme.spacing[4],
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing[3],
      }}
    >
      <Text style={{ fontSize: 24 }}>{state.icon}</Text>
      <View style={{ flex: 1, gap: theme.spacing[1] }}>
        <Text variant="h2" color="onButton">
          {state.title}
        </Text>
        <Text variant="caption" color="onButton">
          {state.subtitle}
        </Text>
      </View>
    </View>
  )
}

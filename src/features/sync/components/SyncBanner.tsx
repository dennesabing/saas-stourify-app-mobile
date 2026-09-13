import { View } from 'react-native'
import { Icon, Text } from '@/shared/components/ui'
import type { IconName } from '@/shared/components/ui/Icon'
import { shortRelativeTime } from '@/shared/utils/relativeTime'
import { useSyncStatusStore, type SyncPhase } from '@/sync/status'
import { useTheme } from '@/theme/ThemeProvider'
import type { ColorRole } from '@/theme/tokens'

export type BannerTone = 'info' | 'success' | 'danger'

export interface BannerState {
  tone: BannerTone
  icon: IconName
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

/** "last synced 12m ago" — the design's line, in `shortRelativeTime`'s units. */
function lastSyncedPhrase(lastSyncedAt: number | null, now: number): string {
  if (lastSyncedAt === null) return 'not synced yet'

  const ago = shortRelativeTime(lastSyncedAt, now)
  return ago === 'just now' ? 'last synced just now' : `last synced ${ago} ago`
}

/** Joins the parts of a second line with the design's middle dot, capitalised once. */
function line(parts: (string | null)[]): string {
  const joined = parts.filter((part): part is string => part !== null).join(' · ')
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

/**
 * First match wins, and the order is deliberate.
 *
 * The title is always the count — the number somebody opened this screen to
 * read, and the design's headline (STOURIFY-294). Being offline is said on the
 * second line instead of replacing it: a queue while offline is the system
 * working as designed, so it must not read as a different, alarming state.
 * Failures outrank a plain queue because only they need a person to act.
 */
export function resolveBannerState(input: BannerInput): BannerState {
  const { phase, offline, pending, failed, lastSyncedAt, now } = input
  const where = offline ? "You're offline" : null
  const when = lastSyncedPhrase(lastSyncedAt, now)

  if (phase !== 'idle') {
    return {
      tone: 'info',
      icon: 'sync',
      title: 'Syncing…',
      subtitle: pending > 0 ? `${changes(pending)} to send` : 'Checking for updates',
    }
  }

  if (failed > 0) {
    return {
      tone: 'danger',
      icon: 'warning',
      title: `${changes(failed)} need${failed === 1 ? 's' : ''} a retry`,
      subtitle: line([where, pending > 0 ? `${pending} waiting` : null, when]),
    }
  }

  if (pending > 0) {
    return {
      tone: 'info',
      icon: 'upload',
      title: `${changes(pending)} waiting to sync`,
      subtitle: line([where, when]),
    }
  }

  return {
    tone: 'success',
    icon: 'check',
    title: 'Everything is synced',
    subtitle: line([where, when]),
  }
}

interface Props {
  pending: number
  failed: number
}

/**
 * The design's `.sync-banner`, drawn as a soft wash rather than the canvas's
 * solid gradient (STOURIFY-294). The canvas is light only; a solid slab is
 * exactly what the dark palette avoids, and a tint from the theme's own tokens
 * reads in both.
 */
const TONES: Record<BannerTone, { wash: ColorRole; edge: ColorRole; ink: ColorRole }> = {
  info: { wash: 'infoBg', edge: 'infoLine', ink: 'primary' },
  success: { wash: 'successBg', edge: 'hairline', ink: 'success' },
  danger: { wash: 'dangerBg', edge: 'hairline', ink: 'danger' },
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
  const tone = TONES[state.tone]

  return (
    <View
      accessibilityRole="summary"
      testID={`sync-banner-${state.tone}`}
      style={{
        backgroundColor: theme.colors[tone.wash],
        borderColor: theme.colors[tone.edge],
        borderWidth: 1,
        borderRadius: 16,
        padding: theme.spacing[4],
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.card,
        }}
      >
        <Icon name={state.icon} size={22} color={tone.ink} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" color="ink" style={{ fontFamily: theme.fontFamily.bodySemiBold }}>
          {state.title}
        </Text>
        <Text variant="caption" color="muted">
          {state.subtitle}
        </Text>
      </View>
    </View>
  )
}

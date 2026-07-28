import { View } from 'react-native'
import { Button, Card, Text } from '@/shared/components/ui'
import type { FailedQueueRow, PendingQueueRow } from '@/sync/queue'
import { useTheme } from '@/theme/ThemeProvider'

export type SyncQueueRowProps =
  | { variant: 'pending'; row: PendingQueueRow }
  | { variant: 'failed'; row: FailedQueueRow; onRetry: () => void; onDiscard: () => void }

/**
 * One queued change. The failed variant carries the server's own words and the
 * two actions that resolve it — a rejected row with no way out is what stalls
 * the whole pull gate (`cycle.ts:58-64`).
 */
export default function SyncQueueRow(props: SyncQueueRowProps) {
  const theme = useTheme()
  const { row } = props

  return (
    <Card raised={false} style={{ gap: theme.spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[3] }}>
        <Text style={{ fontSize: 20 }}>{row.icon}</Text>

        <View style={{ flex: 1, gap: theme.spacing[1] }}>
          <Text variant="body" color="ink">
            {row.title}
          </Text>
          <Text variant="caption" color={props.variant === 'failed' ? 'accent' : 'muted'}>
            {row.meta}
          </Text>
        </View>

        {props.variant === 'pending' ? (
          <Text variant="micro" color="muted">
            Queued
          </Text>
        ) : null}
      </View>

      {props.variant === 'failed' ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
          <Button
            label="Retry"
            variant="secondary"
            onPress={props.onRetry}
            accessibilityLabel={`Retry ${row.title}`}
          />
          <Button
            label="Discard"
            variant="danger"
            onPress={props.onDiscard}
            accessibilityLabel={`Discard ${row.title}`}
          />
        </View>
      ) : null}
    </Card>
  )
}

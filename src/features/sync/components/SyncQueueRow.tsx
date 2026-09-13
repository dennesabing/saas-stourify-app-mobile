import { View } from 'react-native'
import { Button, Card, Icon, Text } from '@/shared/components/ui'
import type { IconName } from '@/shared/components/ui/Icon'
import type { FailedQueueRow, PendingQueueRow, QueueKind } from '@/sync/queue'
import { useTheme } from '@/theme/ThemeProvider'

export type SyncQueueRowProps =
  /**
   * `onDiscard` is optional here and required on `failed`, and the asymmetry is
   * the point (STOURIFY-161).
   *
   * A failed row must always offer a way out — a rejected row with no way out
   * stalls the whole pull gate. A waiting row usually should not: a spot or a
   * photo you made offline is your own work, and the only thing wrong with it
   * is that the radio is off.
   *
   * A queued **post** is the exception, because it is a publication rather than
   * a record. Somebody who wrote something in a tunnel and thought better of it
   * has to be able to stop it before it goes out, and waiting for it to fail is
   * not an option — it is not going to fail, it is going to send.
   */
  | { variant: 'pending'; row: PendingQueueRow; onDiscard?: () => void }
  | { variant: 'failed'; row: FailedQueueRow; onRetry: () => void; onDiscard: () => void }

/** The design's `.q-row .ic` glyph for each kind of queued work (STOURIFY-294). */
const KIND_ICON: Record<QueueKind, IconName> = {
  spot: 'pin',
  review: 'edit',
  wishlist: 'bookmark',
  follow: 'account',
  profile: 'account',
  photo: 'camera',
  post: 'send',
  change: 'sync',
}

/**
 * One queued change, drawn as the design's `.q-row`: an icon tile by kind, the
 * change in words, a muted detail, and a "Queued" pill (STOURIFY-294).
 *
 * The failed variant carries the server's own words and the two actions that
 * resolve it — a rejected row with no way out is what stalls the whole pull
 * gate (`cycle.ts:58-64`).
 */
export default function SyncQueueRow(props: SyncQueueRowProps) {
  const theme = useTheme()
  const { row } = props
  const failed = props.variant === 'failed'

  return (
    <Card
      raised={false}
      padded={false}
      style={{ borderRadius: 14, paddingVertical: 12, paddingHorizontal: 13, gap: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: failed ? theme.colors.dangerBg : theme.colors.badgeBg,
          }}
        >
          <Icon name={KIND_ICON[row.kind]} size={18} color={failed ? 'danger' : 'primary'} />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text
            variant="body"
            color="ink"
            numberOfLines={2}
            style={{ fontFamily: theme.fontFamily.bodySemiBold }}
          >
            {row.title}
          </Text>
          <Text variant="caption" color={failed ? 'danger' : 'muted'}>
            {row.meta}
          </Text>
        </View>

        {props.variant === 'pending' ? (
          <View
            testID="sync-row-queued"
            style={{
              borderRadius: theme.radius.chip,
              backgroundColor: theme.colors.badgeBg,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text
              variant="caption"
              color="badgeInk"
              style={{ fontFamily: theme.fontFamily.bodySemiBold }}
            >
              Queued
            </Text>
          </View>
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

      {props.variant === 'pending' && props.onDiscard !== undefined ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
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

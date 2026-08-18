import { StyleSheet, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Button from './Button'
import Text from './Text'

interface Props {
  icon?: string
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
  /**
   * A second way out, under the first.
   *
   * Some dead ends have two exits and the retry is not always the useful one.
   * The Profile screen's offline state (STOURIFY-120) keeps "Try again" and
   * adds "Settings", because with no network everything a person can still
   * usefully do — their account settings, their blocked list, the queue of work
   * waiting to upload — is behind that second button. Both props or neither;
   * one alone renders nothing.
   */
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
}

/**
 * Empty state. An empty screen should always say what to do next, so the
 * action is offered rather than leaving the user at a dead end.
 */
export default function EmptyState({
  icon = '🌍',
  title,
  subtitle,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: Props) {
  const theme = useTheme()

  return (
    <View style={[styles.container, { padding: theme.spacing[7], gap: theme.spacing[2] }]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text variant="h2" color="ink" style={styles.centered}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" color="muted" style={styles.centered}>
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: theme.spacing[4] }} />
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Button
          label={secondaryActionLabel}
          variant="ghost"
          onPress={onSecondaryAction}
          style={{ marginTop: theme.spacing[2] }}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 48, lineHeight: 56 },
  centered: { textAlign: 'center' },
})

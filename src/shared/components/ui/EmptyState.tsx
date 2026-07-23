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
}

/**
 * Empty state. An empty screen should always say what to do next, so the
 * action is offered rather than leaving the user at a dead end.
 */
export default function EmptyState({ icon = '🌍', title, subtitle, actionLabel, onAction }: Props) {
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 48, lineHeight: 56 },
  centered: { textAlign: 'center' },
})

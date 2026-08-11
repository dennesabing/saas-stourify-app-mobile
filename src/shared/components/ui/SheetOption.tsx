import { Pressable, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

interface Props {
  label: string
  onPress: () => void
  /** A leading emoji or glyph. Decorative — the label carries the meaning. */
  icon?: string
  /** Explanatory second line, for an option whose consequence is not obvious. */
  description?: string
  /** Renders the label in the danger colour. Does not change behaviour. */
  destructive?: boolean
  /** Marks the current choice — used by the report sheet's reason list. */
  selected?: boolean
  disabled?: boolean
  /** Override when the visible label is not enough for a screen reader. */
  accessibilityLabel?: string
}

/**
 * One row inside a `Sheet` — a menu item or a picker option.
 *
 * `selected` renders a check and sets `accessibilityState.selected`, which is
 * what makes a list of these usable as a radio group without a separate
 * primitive. The check is a glyph rather than colour alone: colour is not an
 * accessible state channel, the same rule `Input` follows for its error.
 */
export default function SheetOption({
  label,
  onPress,
  icon,
  description,
  destructive = false,
  selected = false,
  disabled = false,
  accessibilityLabel,
}: Props) {
  const theme = useTheme()

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing[3],
        minHeight: theme.minTouchTarget,
        paddingVertical: theme.spacing[3],
        paddingHorizontal: theme.spacing[3],
        borderRadius: theme.radius.button,
        borderWidth: 1,
        borderColor: selected ? theme.colors.primary : theme.colors.hairline,
        backgroundColor: selected ? theme.colors.badgeBg : 'transparent',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {icon ? <Text variant="body">{icon}</Text> : null}

      <View style={{ flex: 1, gap: theme.spacing[1] }}>
        <Text variant="body" color={destructive ? 'danger' : 'ink'}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color="muted">
            {description}
          </Text>
        ) : null}
      </View>

      {selected ? (
        <Text variant="body" color="primary">
          ✓
        </Text>
      ) : null}
    </Pressable>
  )
}

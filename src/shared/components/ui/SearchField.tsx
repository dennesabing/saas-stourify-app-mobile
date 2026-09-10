import { Pressable, TextInput, View, type ViewStyle } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Icon from './Icon'
import Text from './Text'

interface Props {
  placeholder: string
  /**
   * Give this and the field becomes a button that opens a search screen,
   * rather than an input — the pill on Explore and on the map (STOURIFY-259).
   * One component for both keeps the two looking identical, which is the
   * point: tapping the pill should feel like it is the same box, now typable.
   */
  onPress?: () => void
  value?: string
  onChangeText?: (text: string) => void
  onSubmitEditing?: () => void
  autoFocus?: boolean
  style?: ViewStyle
  testID?: string
}

/**
 * The design's search pill (`.sf` in the Discover artboards): a white field
 * with a hairline border, a magnifier, and muted placeholder text.
 *
 * As an input it carries a clear button once there is something to clear. It
 * is a word-free icon, so it carries its own label for screen readers.
 */
export default function SearchField({
  placeholder,
  onPress,
  value = '',
  onChangeText,
  onSubmitEditing,
  autoFocus = false,
  style,
  testID,
}: Props) {
  const theme = useTheme()

  const frame: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: theme.minTouchTarget,
    paddingHorizontal: 13,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.card,
  }

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        style={({ pressed }) => [frame, { opacity: pressed ? 0.85 : 1 }, style]}
      >
        <Icon name="search" size={15} color="muted" />
        <Text variant="body" color="muted" numberOfLines={1} style={{ flex: 1 }}>
          {placeholder}
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={[frame, style]}>
      <Icon name="search" size={15} color="muted" />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel={placeholder}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ ...theme.typography.body, flex: 1, color: theme.colors.ink, paddingVertical: 10 }}
      />
      {value !== '' && onChangeText ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={theme.spacing[2]}
        >
          <Icon name="close" size={16} color="muted" />
        </Pressable>
      ) : null}
    </View>
  )
}

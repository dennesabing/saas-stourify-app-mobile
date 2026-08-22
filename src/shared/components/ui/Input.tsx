import { TextInput, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

export interface InputProps {
  label?: string
  placeholder?: string
  value: string
  onChangeText: (text: string) => void
  error?: string
  secureTextEntry?: boolean
  keyboardType?: 'default' | 'email-address' | 'numeric'
  autoCapitalize?: 'none' | 'words' | 'sentences'
  multiline?: boolean
  /**
   * Stop typing at the server's own limit rather than letting a long answer be
   * refused after it has been written. A cap the writer can feel while writing
   * is kinder than a 422 after they press send.
   */
  maxLength?: number
  testID?: string
}

/**
 * The text-field primitive.
 *
 * The error is rendered as text rather than colour alone — colour is not an
 * accessible error channel, and the design system has no failure state on the
 * field itself beyond the border.
 */
export default function Input({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  multiline = false,
  maxLength,
  testID,
}: InputProps) {
  const theme = useTheme()
  const hasError = error !== undefined && error !== ''

  return (
    <View style={{ gap: theme.spacing[1] }}>
      {label ? (
        <Text variant="caption" color="muted">
          {label}
        </Text>
      ) : null}

      <TextInput
        testID={testID}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        maxLength={maxLength}
        accessibilityLabel={label}
        accessibilityState={{ disabled: false }}
        style={{
          minHeight: theme.minTouchTarget,
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.button,
          borderWidth: 1,
          borderColor: hasError ? theme.colors.danger : theme.colors.hairline,
          paddingHorizontal: theme.spacing[4],
          paddingVertical: theme.spacing[3],
          color: theme.colors.ink,
          ...theme.typography.body,
        }}
      />

      {hasError ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

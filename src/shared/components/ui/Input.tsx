import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
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
 *
 * **A password field carries its own Show / Hide button** (STOURIFY-99). It
 * lives here rather than on the screens so that all six password fields in the
 * app — Login, Register's two, Reset password's two, and the one that confirms
 * account deletion on Settings — behave identically without any screen deciding
 * anything.
 *
 * That last one was only true from STOURIFY-164, and the gap is the reason this
 * paragraph is worth reading. The claim was written here when STOURIFY-99
 * landed, and it was wrong twice over: that field was built from a raw
 * `TextInput` on its own screen rather than from this component, so it never
 * got the button — and it is not a change-password box, which does not exist,
 * but the confirmation for an irreversible deletion. A shared fix reaches
 * exactly the callers that are actually shared, and a sentence in a docstring
 * cannot make a screen one of them.
 *
 * Three properties are load-bearing:
 *
 * - It **starts hidden** and nothing can pass it in revealed. The state is
 *   private to this component precisely so that stays true.
 * - It **stays revealed while the caller re-renders**. React Hook Form re-renders
 *   this field on every keystroke, so a reveal reset on blur or on change would
 *   flicker back to dots during the exact activity it exists for. Leaving the
 *   screen unmounts the component and takes the reveal with it, which is the
 *   only re-masking anybody needs.
 * - It is a **word, not an eye icon**. This app installs no icon set, and an
 *   emoji's screen-reader announcement is chosen by the phone — which would make
 *   the one state-dependent control on the screen the least readable thing on it.
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
  const [revealed, setRevealed] = useState(false)

  // Reserve room for the button so a long password never runs underneath it.
  // Applied only when the button is there, so every other field is untouched.
  const revealWidth = theme.spacing[4] * 4

  return (
    <View style={{ gap: theme.spacing[1] }}>
      {label ? (
        <Text variant="caption" color="muted">
          {label}
        </Text>
      ) : null}

      <View>
        <TextInput
          testID={testID}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry && !revealed}
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
            paddingLeft: theme.spacing[4],
            paddingRight: secureTextEntry ? revealWidth : theme.spacing[4],
            paddingVertical: theme.spacing[3],
            color: theme.colors.ink,
            ...theme.typography.body,
          }}
        />

        {secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={theme.spacing[2]}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              minHeight: theme.minTouchTarget,
              justifyContent: 'center',
              paddingHorizontal: theme.spacing[4],
            }}
          >
            <Text variant="caption" color="primary">
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {hasError ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

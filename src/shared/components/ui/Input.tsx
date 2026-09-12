import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Icon, { type IconName } from './Icon'
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
  /**
   * A glyph drawn inside the field, before the text — the Auth & Entry field's
   * envelope and padlock (STOURIFY-286). Decorative: the label names the field.
   */
  icon?: IconName
  /**
   * `lg` is the Auth & Entry field: 54 points tall, its label in small capitals
   * above it. `md`, the default, is every other field in the app, unchanged.
   */
  size?: 'md' | 'lg'
  testID?: string
}

/** The design's field icon: 18 points, then an 11-point gap before the text. */
const ICON_SIZE = 18
const ICON_GAP = 11

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
 * - It is a **word, not an eye icon**. An eye's meaning flips depending on who
 *   drew it (show, or currently shown?), and a word says which it will do. The
 *   leading `icon` added in STOURIFY-286 is decoration beside a label; this
 *   button is a control, and a control says what it does.
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
  icon,
  size = 'md',
  testID,
}: InputProps) {
  const theme = useTheme()
  const hasError = error !== undefined && error !== ''
  const [revealed, setRevealed] = useState(false)
  const large = size === 'lg'

  // Reserve room for the button so a long password never runs underneath it.
  // Applied only when the button is there, so every other field is untouched.
  const revealWidth = theme.spacing[4] * 4

  return (
    <View style={{ gap: large ? theme.spacing[2] : theme.spacing[1] }}>
      {label ? (
        large ? (
          <Text variant="micro" color="muted" style={{ fontSize: 12, letterSpacing: 0.6 }}>
            {label}
          </Text>
        ) : (
          <Text variant="caption" color="muted">
            {label}
          </Text>
        )
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
            minHeight: large ? 54 : theme.minTouchTarget,
            backgroundColor: theme.colors.card,
            borderRadius: theme.radius.button,
            borderWidth: 1,
            borderColor: hasError ? theme.colors.danger : theme.colors.hairline,
            paddingLeft: icon ? theme.spacing[4] + ICON_SIZE + ICON_GAP : theme.spacing[4],
            paddingRight: secureTextEntry ? revealWidth : theme.spacing[4],
            paddingVertical: theme.spacing[3],
            color: theme.colors.ink,
            ...theme.typography.body,
            ...(large ? { fontSize: 16 } : null),
          }}
        />

        {icon ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: theme.spacing[4],
              top: 0,
              bottom: 0,
              justifyContent: 'center',
            }}
          >
            <Icon name={icon} size={ICON_SIZE} color="muted" />
          </View>
        ) : null}

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

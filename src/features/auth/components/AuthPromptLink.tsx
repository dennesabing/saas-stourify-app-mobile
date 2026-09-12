import { Pressable } from 'react-native'
import { Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  /** The grey half — "New to Stourify?". Omit for a bare link, like "Back to log in". */
  prompt?: string
  /** The blue half — "Sign up". */
  action: string
  onPress: () => void
  disabled?: boolean
}

/**
 * The line under a sign-in form's main button: a grey question and a blue
 * answer, "New to Stourify? Sign up" (STOURIFY-286).
 *
 * The design makes only the blue word tappable. Here the whole line is, and it
 * is 44 points tall: a single short word is a small target for a thumb, and the
 * line holds nothing else anyone could mean to tap.
 */
export default function AuthPromptLink({ prompt, action, onPress, disabled = false }: Props) {
  const theme = useTheme()

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={action}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        minHeight: theme.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: theme.spacing[2],
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        variant="body"
        color="muted"
        style={{ fontFamily: theme.fontFamily.bodyMedium, fontSize: 14, textAlign: 'center' }}
      >
        {prompt ? `${prompt} ` : null}
        <Text
          variant="body"
          color="primary"
          style={{ fontFamily: theme.fontFamily.bodySemiBold, fontSize: 14 }}
        >
          {action}
        </Text>
      </Text>
    </Pressable>
  )
}

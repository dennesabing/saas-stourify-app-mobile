import { View } from 'react-native'
import { Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

export interface Strength {
  /** 0 before anything is typed, then 1 (weak) to 3 (strong) — the number of bars lit. */
  score: 0 | 1 | 2 | 3
  label: string
}

const KINDS = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]

/**
 * How strong a new password looks, worked out on the phone as it is typed
 * (STOURIFY-286).
 *
 * Think of it as a bathroom scale, not a bouncer. It tells you how you are
 * doing and never stops you coming in: sign-up is never blocked on it, and the
 * server's own password rule is still the only thing that can refuse one.
 *
 * - Under 8 characters is weak, whatever it contains — the server's own minimum.
 * - From 8 up, each kind of character used (lowercase, capitals, digits,
 *   symbols) is a point, and a length of 12 or more is one more point.
 *   One point is weak, two good, three or more strong.
 *
 * The design prototype scored length alone (strong at nine), which would praise
 * `aaaaaaaaa`. Variety is what makes a password slow to guess, so it counts.
 */
export function passwordStrength(password: string): Strength {
  if (password.length === 0) return { score: 0, label: 'Use 8+ characters' }
  if (password.length < 8) return { score: 1, label: 'Strength: Weak' }

  const kinds = KINDS.filter((kind) => kind.test(password)).length
  const points = kinds + (password.length >= 12 ? 1 : 0)

  if (points >= 3) return { score: 3, label: 'Strength: Strong' }
  if (points === 2) return { score: 2, label: 'Strength: Good' }
  return { score: 1, label: 'Strength: Weak' }
}

const TONE = { 0: 'muted', 1: 'danger', 2: 'primary', 3: 'success' } as const

/** The design's three bars and the line under them, for the password being typed. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const theme = useTheme()
  const { score, label } = passwordStrength(password)
  const tone = TONE[score]

  return (
    <View testID="password-strength" style={{ marginTop: 10, gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3].map((bar) => (
          <View
            key={bar}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: score >= bar ? theme.colors[tone] : theme.colors.hairline,
            }}
          />
        ))}
      </View>
      <Text
        variant="caption"
        color={tone}
        style={{ fontSize: 12 }}
        accessibilityLiveRegion="polite"
      >
        {label}
      </Text>
    </View>
  )
}

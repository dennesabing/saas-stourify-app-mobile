import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AxiosError } from 'axios'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { changePassword } from '@/shared/api/account'
import { BarHeader, Button, Input, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<ProfileStackParamList, 'ChangePassword'>

type Field = 'current_password' | 'password' | 'password_confirmation'
type FieldErrors = Partial<Record<Field, string>>

/** The server's own floor (`boilerplate.auth.password_min_length`). It stays the judge. */
const MIN_LENGTH = 8

const WRONG_CURRENT = "That isn't your current password."
const TOO_MANY = 'Too many tries. Wait a minute, then try again.'
const UNREACHABLE = "We couldn't reach Stourify — check your connection and try again."
const TIMED_OUT =
  'Stourify took too long to answer. Your password may have changed — if this keeps ' +
  'happening, try signing in with the new one.'
const NOT_CHANGED = "Your password wasn't changed. Try again in a moment."

/**
 * What a refused change should say, and under which field.
 *
 * Every sentence is the screen's own except one: a `422` on the new password
 * passes on the server's rule ("must be at least 12 characters"), because that
 * is written for the person who typed it and the server is the only one who
 * knows its rule. Two exceptions to that exception:
 *
 * - **`current_password`** is always answered in the screen's words. Laravel's
 *   message is "The password is incorrect.", and on a screen with three
 *   password fields that does not say which one.
 * - **Any server message that contains something typed is dropped** for the
 *   screen's own wording. Laravel's rules never echo a value, so this should
 *   never fire — it is there so that "the screen never shows a password" is a
 *   property of this function rather than of the server's good behaviour.
 */
function readFailure(
  error: unknown,
  typed: string[],
): { fields: FieldErrors; general: string | null } {
  const safe = (message: unknown): string | undefined =>
    typeof message === 'string' && !typed.some((value) => value !== '' && message.includes(value))
      ? message
      : undefined

  if (!(error instanceof AxiosError)) return { fields: {}, general: NOT_CHANGED }

  if (error.response === undefined) {
    const timedOut = error.code === AxiosError.ETIMEDOUT || error.code === AxiosError.ECONNABORTED
    return { fields: {}, general: timedOut ? TIMED_OUT : UNREACHABLE }
  }

  const { status, data } = error.response
  if (status === 429) return { fields: {}, general: TOO_MANY }

  if (status === 422) {
    const errors = (data as { errors?: Record<string, unknown> } | null)?.errors ?? {}
    const first = (field: Field) => {
      const messages = errors[field]
      return Array.isArray(messages) ? safe(messages[0]) : undefined
    }

    const fields: FieldErrors = {}
    if (errors.current_password !== undefined) fields.current_password = WRONG_CURRENT
    if (errors.password !== undefined) {
      fields.password = first('password') ?? "Stourify couldn't accept that new password."
    }
    if (errors.password_confirmation !== undefined) {
      fields.password_confirmation =
        first('password_confirmation') ?? "The two new passwords don't match."
    }

    if (Object.keys(fields).length > 0) return { fields, general: null }
  }

  // A 401 lands here too; the shared client has already started signing out.
  return { fields: {}, general: NOT_CHANGED }
}

/**
 * Change password — the row the Settings design draws under Account security
 * on artboard 3 (STOURIFY-302), calling the server's `PUT /me/password`.
 *
 * The one thing about this screen that is unlike the rest of the app: it does
 * not work offline, on purpose. `shared/api/account.ts` → `changePassword` says
 * why. Offline, the request simply fails and the screen says to check the
 * connection.
 *
 * The success state keeps you here and signed in. The server spares the token
 * that made the request, so signing out would only throw away a session this
 * person just proved they own — and on this app it would wipe the phone's local
 * copy with it (STOURIFY-214).
 */
export default function ChangePasswordScreen({ navigation }: Props) {
  const theme = useTheme()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setChanged(false)

    // Checked here before sending, because the server allows five tries a
    // minute and a typo in the confirmation should not cost one of them.
    const local: FieldErrors = {}
    if (current === '') local.current_password = 'Enter your current password.'
    if (next.length < MIN_LENGTH) {
      local.password = `Your new password needs at least ${MIN_LENGTH} characters.`
    }
    if (confirm !== next) local.password_confirmation = "The two new passwords don't match."
    setFieldErrors(local)
    if (Object.keys(local).length > 0) return

    setBusy(true)
    try {
      await changePassword({
        current_password: current,
        password: next,
        password_confirmation: confirm,
      })
      setCurrent('')
      setNext('')
      setConfirm('')
      setChanged(true)
    } catch (failure) {
      const read = readFailure(failure, [current, next, confirm])
      setFieldErrors(read.fields)
      setError(read.general)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View
      testID="change-password-screen"
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
    >
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <BarHeader title="Change password" onBack={() => navigation.goBack()} />

        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: theme.gutter,
            paddingTop: theme.spacing[3],
            // Clears the tab bar over the bottom of this stack (STOURIFY-181).
            paddingBottom: 48,
            gap: theme.spacing[4],
          }}
        >
          {/*
            Said before the button rather than after it, the way the web form
            does: a warning delivered afterwards is how somebody's tablet signs
            out later with nobody connecting the two.
          */}
          <Text variant="body" color="muted">
            Changing your password signs you out on every other phone and browser. This phone stays
            signed in.
          </Text>

          <Input
            label="Current password"
            placeholder="Your current password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            value={current}
            onChangeText={setCurrent}
            error={fieldErrors.current_password}
          />
          <Input
            label="New password"
            placeholder={`At least ${MIN_LENGTH} characters`}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            value={next}
            onChangeText={setNext}
            error={fieldErrors.password}
          />
          <Input
            label="Confirm new password"
            placeholder="Type the new password again"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            value={confirm}
            onChangeText={setConfirm}
            error={fieldErrors.password_confirmation}
          />

          {error !== null ? (
            <Text testID="change-password-error" variant="caption" color="danger">
              {error}
            </Text>
          ) : null}

          {changed ? (
            <View
              testID="password-changed"
              style={{
                backgroundColor: theme.colors.successBg,
                borderRadius: theme.radius.button,
                padding: theme.spacing[3],
              }}
            >
              <Text variant="body" color="success">
                Password changed. You're still signed in on this phone.
              </Text>
            </View>
          ) : null}

          <Button
            testID="change-password-submit"
            label={busy ? 'Changing…' : 'Change password'}
            fullWidth
            disabled={busy}
            onPress={submit}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

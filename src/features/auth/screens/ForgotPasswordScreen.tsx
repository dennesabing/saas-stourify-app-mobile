import { useState } from 'react'
import { View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/shared/navigation/types'
import * as authApi from '@/shared/api/auth'
import { extractApiError } from '@/shared/api/client'
import { Button, Input, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'
import { AuthHeading, AuthIconTile, AuthScreen, AuthSpacer } from '../components/AuthScreen'
import AuthPromptLink from '../components/AuthPromptLink'

type FormData = { email: string }

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>

/**
 * The Auth & Entry design's FORGOT, in its two states: the form, then "Check
 * your inbox" (STOURIFY-286).
 *
 * The server always returns 200 for `/forgot-password`, whether or not the
 * address exists — it deliberately does not reveal account existence. So the
 * confirmation names the address it was given but never says an account is
 * there: the canvas's "We sent a reset link to …" would tell a stranger which
 * addresses are registered. "I have a reset code" is the app's own step, not in
 * the canvas, and stays.
 */
export default function ForgotPasswordScreen({ navigation }: Props) {
  const theme = useTheme()
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')
  const [sent, setSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ defaultValues: { email: '' } })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setServerError('')
    try {
      await authApi.forgotPassword(data.email)
      setSentEmail(data.email)
      setSent(true)
    } catch (err) {
      setServerError(extractApiError(err))
    } finally {
      setLoading(false)
    }
  }

  // The same request again, to the same address — the canvas's "Resend".
  const resend = async () => {
    setResending(true)
    setResent(false)
    setServerError('')
    try {
      await authApi.forgotPassword(sentEmail)
      setResent(true)
    } catch (err) {
      setServerError(extractApiError(err))
    } finally {
      setResending(false)
    }
  }

  // `popTo`, not `navigate`: since React Navigation 7, `navigate` no longer
  // returns to a screen already in the stack — it would stack a second Log In
  // on top, and its Back would lead here again. Found on the emulator.
  const backToLogin = () => navigation.popTo('Login')

  const errorLine = serverError ? (
    <Text variant="caption" color="danger" style={{ marginTop: theme.spacing[3] }}>
      {serverError}
    </Text>
  ) : null

  if (sent) {
    return (
      <AuthScreen onBack={() => navigation.goBack()}>
        <View style={{ marginTop: theme.spacing[8] }}>
          <AuthIconTile icon="check" tone="success" />
        </View>

        <View style={{ marginTop: 22 }}>
          <AuthHeading
            title="Check your inbox"
            subtitle={
              <>
                If an account exists for{' '}
                <Text variant="body" style={{ fontFamily: theme.fontFamily.bodySemiBold }}>
                  {sentEmail}
                </Text>
                , we&apos;ve sent it a reset link. Follow it to set a new password.
              </>
            }
          />
        </View>

        <Button
          label="I have a reset code"
          variant="secondary"
          size="lg"
          onPress={() => navigation.navigate('ResetPassword', { email: sentEmail })}
          fullWidth
          style={{ marginTop: theme.spacing[6] }}
        />

        {resent ? (
          <Text variant="caption" color="success" style={{ marginTop: theme.spacing[3] }}>
            Sent again.
          </Text>
        ) : null}
        {errorLine}

        <AuthSpacer />

        <Button label="Back to log in" size="lg" onPress={backToLogin} fullWidth />

        <AuthPromptLink
          prompt="Didn't get it?"
          action="Resend"
          onPress={resend}
          disabled={resending}
        />
      </AuthScreen>
    )
  }

  return (
    <AuthScreen onBack={() => navigation.goBack()}>
      <View style={{ marginTop: theme.spacing[8] }}>
        <AuthIconTile icon="mail" />
      </View>

      <View style={{ marginTop: 22 }}>
        <AuthHeading
          title="Reset your password"
          subtitle="Enter the email tied to your account and we'll send you a secure link to set a new password."
        />
      </View>

      <View style={{ marginTop: 26 }}>
        <Controller
          control={control}
          name="email"
          rules={{
            required: 'Email is required',
            pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email address' },
          }}
          render={({ field: { onChange, value } }) => (
            <Input
              size="lg"
              icon="mail"
              label="Email"
              placeholder="you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={value}
              onChangeText={onChange}
              error={errors.email?.message}
            />
          )}
        />
      </View>

      {errorLine}

      <Button
        label="Send reset link"
        size="lg"
        onPress={handleSubmit(onSubmit)}
        loading={loading}
        fullWidth
        style={{ marginTop: theme.spacing[5] }}
      />

      <AuthSpacer />

      <AuthPromptLink action="Back to log in" onPress={backToLogin} />
    </AuthScreen>
  )
}

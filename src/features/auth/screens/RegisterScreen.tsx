import { useState } from 'react'
import { Linking, View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/shared/navigation/types'
import { useAuthStore } from '@/shared/store/auth'
import { useOnboardingStore } from '@/shared/store/onboarding'
import * as authApi from '@/shared/api/auth'
import { extractApiError, extractValidationErrors } from '@/shared/api/client'
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/shared/config/legal'
import { onLogin } from '@/sync/session'
import { Button, Input, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'
import { AuthHeading, AuthScreen, AuthSpacer } from '../components/AuthScreen'
import AuthPromptLink from '../components/AuthPromptLink'
import { PasswordStrengthMeter } from '../components/PasswordStrength'

type FormData = {
  name: string
  email: string
  password: string
  password_confirmation: string
  code: string
}

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>

/**
 * The Auth & Entry design's SIGN UP (STOURIFY-286).
 *
 * The canvas draws Email and Password only. Name and Confirm password stay,
 * because the server's `RegisterRequest` requires `name` and a `confirmed`
 * password — a cleaner form that failed every submit would be worse than a
 * slightly longer one. The social buttons it draws are left out: the server has
 * no social sign-in (`docs/what-the-sign-in-screens-leave-out.md`).
 *
 * The `onLogin` fix: `LoginScreen` has always primed the sync session after
 * authenticating; this screen never did, so a newly registered account had no
 * local database and no sync cursor until its next sign-in.
 */
export default function RegisterScreen({ navigation }: Props) {
  const theme = useTheme()
  const { setToken, setUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const { data: authConfig } = useQuery({
    queryKey: ['auth-config'],
    queryFn: authApi.getAuthConfig,
  })
  const invitationOnly = authConfig?.invitation_only ?? false
  const registrationEnabled = authConfig?.registration_enabled ?? true

  const {
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: { name: '', email: '', password: '', password_confirmation: '', code: '' },
  })

  const password = watch('password')

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setServerError('')
    try {
      const code = invitationOnly ? data.code : undefined
      const res = await authApi.register(
        data.name,
        data.email,
        data.password,
        data.password_confirmation,
        code,
      )
      // MUST come before `setToken`. A login never sets this — only a
      // successful registration routes into onboarding (`RootNavigator`).
      //
      // Ordering is load-bearing: `setToken` is what makes `RootNavigator`'s
      // `token` truthy, and the navigator chooses its stack on that same
      // render. Flagging onboarding afterwards left a window in which
      // `needsOnboarding` was false, so MainTabs mounted and the feed fired
      // `/feed` + `/sync/delta` before onboarding was ever considered. With
      // `await onLogin()` in between — a full sync cycle — that window was
      // seconds wide on a real network, and the user simply landed on the feed.
      // Observed on device 2026-07-29; every jest test still passed, because
      // none of them rendered the navigator.
      useOnboardingStore.getState().markRegistered()

      setToken(res.token)
      setUser(res.user)
      await onLogin()
    } catch (err) {
      const ve = extractValidationErrors(err)
      const knownFields: (keyof FormData)[] = [
        'name',
        'email',
        'password',
        'password_confirmation',
        'code',
      ]
      let hasFieldError = false
      Object.entries(ve).forEach(([field, msgs]) => {
        if (knownFields.includes(field as keyof FormData)) {
          setError(field as keyof FormData, { message: msgs[0] })
          hasFieldError = true
        }
      })
      if (!hasFieldError) setServerError(extractApiError(err))
    } finally {
      setLoading(false)
    }
  }

  // The same pages Settings → Terms & privacy policy opens.
  const openLegalPage = (url: string) => {
    Linking.openURL(url).catch(() => {})
  }

  const legalLink = { fontFamily: theme.fontFamily.bodySemiBold, fontSize: 12 }

  return (
    <AuthScreen onBack={() => navigation.goBack()}>
      <View style={{ marginTop: 18 }}>
        <AuthHeading
          title="Create your account"
          subtitle="Join a community discovering local gems."
        />
      </View>

      <View style={{ marginTop: 22, gap: 14 }}>
        <Controller
          control={control}
          name="name"
          rules={{ required: 'Name is required' }}
          render={({ field: { onChange, value } }) => (
            <Input
              size="lg"
              icon="account"
              label="Name"
              placeholder="Your name"
              autoCapitalize="words"
              value={value}
              onChangeText={onChange}
              error={errors.name?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          rules={{
            required: 'Email is required',
            pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
          }}
          render={({ field: { onChange, value } }) => (
            <Input
              size="lg"
              icon="mail"
              label="Email"
              placeholder="you@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={value}
              onChangeText={onChange}
              error={errors.email?.message}
            />
          )}
        />

        <View>
          <Controller
            control={control}
            name="password"
            rules={{
              required: 'Password is required',
              minLength: { value: 8, message: 'Min 8 characters' },
            }}
            render={({ field: { onChange, value } }) => (
              <Input
                size="lg"
                icon="lock"
                label="Password"
                placeholder="Create a password"
                secureTextEntry
                autoCapitalize="none"
                value={value}
                onChangeText={onChange}
                error={errors.password?.message}
              />
            )}
          />
          <PasswordStrengthMeter password={password} />
        </View>

        <Controller
          control={control}
          name="password_confirmation"
          rules={{
            required: 'Password confirmation is required',
            validate: (v) => v === password || 'Passwords do not match',
          }}
          render={({ field: { onChange, value } }) => (
            <Input
              size="lg"
              icon="lock"
              label="Confirm password"
              placeholder="Repeat your password"
              secureTextEntry
              autoCapitalize="none"
              value={value}
              onChangeText={onChange}
              error={errors.password_confirmation?.message}
            />
          )}
        />

        {invitationOnly ? (
          <Controller
            control={control}
            name="code"
            rules={{ required: 'Invitation code is required' }}
            render={({ field: { onChange, value } }) => (
              <Input
                size="lg"
                icon="ticket"
                label="Invitation code"
                placeholder="Invitation code"
                autoCapitalize="none"
                value={value}
                onChangeText={onChange}
                error={errors.code?.message}
              />
            )}
          />
        ) : null}
      </View>

      {!registrationEnabled ? (
        <Text variant="body" color="danger" style={{ marginTop: theme.spacing[4] }}>
          Registration is currently closed.
        </Text>
      ) : null}

      {serverError ? (
        <Text variant="caption" color="danger" style={{ marginTop: theme.spacing[4] }}>
          {serverError}
        </Text>
      ) : null}

      <AuthSpacer />

      <Text
        variant="caption"
        color="muted"
        style={{
          fontFamily: theme.fontFamily.bodyRegular,
          fontSize: 12,
          marginTop: 14,
          marginBottom: theme.spacing[3],
        }}
      >
        By creating an account you agree to our{' '}
        <Text
          variant="caption"
          color="primary"
          style={legalLink}
          accessibilityRole="link"
          onPress={() => openLegalPage(TERMS_URL)}
        >
          Terms
        </Text>
        {' & '}
        <Text
          variant="caption"
          color="primary"
          style={legalLink}
          accessibilityRole="link"
          onPress={() => openLegalPage(PRIVACY_POLICY_URL)}
        >
          Privacy Policy
        </Text>
        .
      </Text>

      <Button
        label="Create account"
        size="lg"
        onPress={handleSubmit(onSubmit)}
        loading={loading}
        disabled={!registrationEnabled}
        fullWidth
      />

      <AuthPromptLink
        prompt="Already have an account?"
        action="Log in"
        // `popTo`, not `navigate`: React Navigation 7's `navigate` stacks a
        // second Log In on top of one already underneath (STOURIFY-305). With
        // none underneath, `popTo` swaps this screen for Log In.
        onPress={() => navigation.popTo('Login')}
      />
    </AuthScreen>
  )
}

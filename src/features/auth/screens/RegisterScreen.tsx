import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Controller, useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/shared/navigation/types'
import { useAuthStore } from '@/shared/store/auth'
import { useOnboardingStore } from '@/shared/store/onboarding'
import * as authApi from '@/shared/api/auth'
import { extractApiError, extractValidationErrors } from '@/shared/api/client'
import { onLogin } from '@/sync/session'
import { Button, Input, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

type FormData = { name: string; email: string; password: string; password_confirmation: string; code: string }

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>

/**
 * The `onLogin` fix: `LoginScreen` has always primed the sync session after
 * authenticating; this screen never did, so a newly registered account had no
 * local database and no sync cursor until its next sign-in.
 */
export default function RegisterScreen({ navigation }: Props) {
  const theme = useTheme()
  const { setToken, setUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const { data: authConfig } = useQuery({ queryKey: ['auth-config'], queryFn: authApi.getAuthConfig })
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
      const res = await authApi.register(data.name, data.email, data.password, data.password_confirmation, code)
      setToken(res.token)
      setUser(res.user)
      await onLogin()
      // A login never sets this — only a successful registration routes into
      // onboarding (`RootNavigator`).
      useOnboardingStore.getState().markRegistered()
    } catch (err) {
      const ve = extractValidationErrors(err)
      const knownFields: (keyof FormData)[] = ['name', 'email', 'password', 'password_confirmation', 'code']
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: theme.gutter, justifyContent: 'center' }}>
        <View style={{ gap: theme.spacing[5] }}>
          <Text variant="h1">Create Account</Text>

          <Controller
            control={control}
            name="name"
            rules={{ required: 'Name is required' }}
            render={({ field: { onChange, value } }) => (
              <Input
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
            rules={{ required: 'Email is required', pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' } }}
            render={({ field: { onChange, value } }) => (
              <Input
                label="Email"
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={value}
                onChangeText={onChange}
                error={errors.email?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            rules={{ required: 'Password is required', minLength: { value: 8, message: 'Min 8 characters' } }}
            render={({ field: { onChange, value } }) => (
              <Input
                label="Password"
                placeholder="At least 8 characters"
                secureTextEntry
                autoCapitalize="none"
                value={value}
                onChangeText={onChange}
                error={errors.password?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password_confirmation"
            rules={{
              required: 'Password confirmation is required',
              validate: (v) => v === password || 'Passwords do not match',
            }}
            render={({ field: { onChange, value } }) => (
              <Input
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

          {!registrationEnabled ? (
            <Text variant="body" color="danger">
              Registration is currently closed.
            </Text>
          ) : null}

          {serverError ? (
            <Text variant="caption" color="danger">
              {serverError}
            </Text>
          ) : null}

          <Button
            label="Create account"
            onPress={handleSubmit(onSubmit)}
            loading={loading}
            disabled={!registrationEnabled}
            fullWidth
          />

          <Button label="Already have an account? Login" variant="ghost" onPress={() => navigation.navigate('Login')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

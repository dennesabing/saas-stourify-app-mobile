import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useForm, Controller } from 'react-hook-form'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/shared/navigation/types'
import { useAuthStore } from '@/shared/store/auth'
import * as authApi from '@/shared/api/auth'
import { extractApiError, extractValidationErrors } from '@/shared/api/client'
import { onLogin } from '@/sync/session'
import { BuildIdentity, Button, Input, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'
import { AuthHeading, AuthScreen, AuthSpacer } from '../components/AuthScreen'
import AuthPromptLink from '../components/AuthPromptLink'

type FormData = { email: string; password: string }

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>

/**
 * The Auth & Entry design's LOG IN (STOURIFY-286). The canvas also draws
 * "Continue with Google / Apple / Facebook"; they are left out because the
 * server has no social sign-in to call — see
 * `docs/what-the-sign-in-screens-leave-out.md`.
 */
export default function LoginScreen({ navigation }: Props) {
  const theme = useTheme()
  const { setToken, setUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setServerError('')
    try {
      const res = await authApi.login(data.email, data.password)
      setToken(res.token)
      setUser(res.user)
      await onLogin()
    } catch (err) {
      const validationErrors = extractValidationErrors(err)
      if (validationErrors.email) setError('email', { message: validationErrors.email[0] })
      if (validationErrors.password) setError('password', { message: validationErrors.password[0] })
      if (!validationErrors.email && !validationErrors.password) {
        setServerError(extractApiError(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthScreen onBack={() => navigation.goBack()}>
      <View style={{ marginTop: 20 }}>
        <AuthHeading title="Welcome back" subtitle="Log in to keep exploring." />
      </View>

      <View style={{ marginTop: theme.spacing[6], gap: 15 }}>
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
              keyboardType="email-address"
              autoCapitalize="none"
              value={value}
              onChangeText={onChange}
              error={errors.email?.message}
            />
          )}
        />

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
              placeholder="Enter your password"
              secureTextEntry
              autoCapitalize="none"
              value={value}
              onChangeText={onChange}
              error={errors.password?.message}
            />
          )}
        />
      </View>

      <Pressable
        onPress={() => navigation.navigate('ForgotPassword')}
        accessibilityRole="button"
        hitSlop={theme.spacing[2]}
        style={({ pressed }) => ({
          alignSelf: 'flex-end',
          minHeight: theme.minTouchTarget,
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          variant="body"
          color="primary"
          style={{ fontFamily: theme.fontFamily.bodySemiBold, fontSize: 14 }}
        >
          Forgot password?
        </Text>
      </Pressable>

      {serverError ? (
        <Text variant="caption" color="danger">
          {serverError}
        </Text>
      ) : null}

      <AuthSpacer />

      <Button
        label="Log in"
        size="lg"
        onPress={handleSubmit(onSubmit)}
        loading={loading}
        fullWidth
      />

      <AuthPromptLink
        prompt="New to Stourify?"
        action="Sign up"
        onPress={() => navigation.navigate('Register')}
      />

      <BuildIdentity />
    </AuthScreen>
  )
}

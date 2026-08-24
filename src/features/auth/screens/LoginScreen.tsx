import { useState } from 'react'
import { View } from 'react-native'
import { useForm, Controller } from 'react-hook-form'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/shared/navigation/types'
import { useAuthStore } from '@/shared/store/auth'
import * as authApi from '@/shared/api/auth'
import { extractApiError, extractValidationErrors } from '@/shared/api/client'
import { onLogin } from '@/sync/session'
import { BuildIdentity, Button, Input, KeyboardAwareScreen, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

type FormData = { email: string; password: string }

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>

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
    <KeyboardAwareScreen centered>
      <View style={{ gap: theme.spacing[5] }}>
        <Text variant="h1">Welcome back</Text>

        <Controller
          control={control}
          name="email"
          rules={{
            required: 'Email is required',
            pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
          }}
          render={({ field: { onChange, value } }) => (
            <Input
              label="Email"
              placeholder="you@example.com"
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
              label="Password"
              placeholder="Your password"
              secureTextEntry
              autoCapitalize="none"
              value={value}
              onChangeText={onChange}
              error={errors.password?.message}
            />
          )}
        />

        <Button
          label="Forgot password?"
          variant="ghost"
          onPress={() => navigation.navigate('ForgotPassword')}
        />

        {serverError ? (
          <Text variant="caption" color="danger">
            {serverError}
          </Text>
        ) : null}

        <Button label="Sign in" onPress={handleSubmit(onSubmit)} loading={loading} fullWidth />

        <Button
          label="New here? Create an account"
          variant="ghost"
          onPress={() => navigation.navigate('Register')}
        />

        <BuildIdentity />
      </View>
    </KeyboardAwareScreen>
  )
}

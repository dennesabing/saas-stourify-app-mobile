import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Controller, useForm } from 'react-hook-form'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/shared/navigation/types'
import * as authApi from '@/shared/api/auth'
import { extractApiError } from '@/shared/api/client'
import { Button, Input, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

type FormData = { email: string; token: string; password: string; password_confirmation: string }

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>

/**
 * `/reset-password` returns no token — the user must sign in again after this
 * succeeds, so the only place this screen goes on success is `Login`.
 */
export default function ResetPasswordScreen({ navigation, route }: Props) {
  const theme = useTheme()
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: { email: route.params?.email ?? '', token: '', password: '', password_confirmation: '' },
  })

  const password = watch('password')

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setServerError('')
    try {
      await authApi.resetPassword({
        token: data.token,
        email: data.email,
        password: data.password,
        password_confirmation: data.password_confirmation,
      })
      navigation.navigate('Login')
    } catch (err) {
      // A 422 here means an expired or wrong code — surface it as a message,
      // never a crash.
      setServerError(extractApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: theme.gutter, justifyContent: 'center' }}>
        <View style={{ gap: theme.spacing[5] }}>
          <Text variant="h1">Choose a new password</Text>

          <Controller
            control={control}
            name="email"
            rules={{
              required: 'Email is required',
              pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email address' },
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
            name="token"
            rules={{ required: 'The reset code is required' }}
            render={({ field: { onChange, value } }) => (
              <Input
                label="Reset code"
                placeholder="Paste the code from your email"
                autoCapitalize="none"
                value={value}
                onChangeText={onChange}
                error={errors.token?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            rules={{ required: 'Password is required', minLength: { value: 8, message: 'Min 8 characters' } }}
            render={({ field: { onChange, value } }) => (
              <Input
                label="New password"
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
              required: 'Please repeat your password',
              validate: (v) => v === password || 'Passwords do not match',
            }}
            render={({ field: { onChange, value } }) => (
              <Input
                label="Repeat password"
                placeholder="Repeat your password"
                secureTextEntry
                autoCapitalize="none"
                value={value}
                onChangeText={onChange}
                error={errors.password_confirmation?.message}
              />
            )}
          />

          {serverError ? (
            <Text variant="caption" color="danger">
              {serverError}
            </Text>
          ) : null}

          <Button label="Reset password" onPress={handleSubmit(onSubmit)} loading={loading} fullWidth />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

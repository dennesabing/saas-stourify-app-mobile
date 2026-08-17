import { useState } from 'react'
import { View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/shared/navigation/types'
import * as authApi from '@/shared/api/auth'
import { extractApiError } from '@/shared/api/client'
import { Button, Input, KeyboardAwareScreen, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

type FormData = { email: string }

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>

/**
 * The server always returns 200 for `/forgot-password`, whether or not the
 * address exists — it deliberately does not reveal account existence. The
 * success copy stays non-committal to match that contract.
 */
export default function ForgotPasswordScreen({ navigation }: Props) {
  const theme = useTheme()
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')
  const [sent, setSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')

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

  return (
    <KeyboardAwareScreen centered>
      <View style={{ gap: theme.spacing[5] }}>
        <Text variant="h1">Reset your password</Text>

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

        {serverError ? (
          <Text variant="caption" color="danger">
            {serverError}
          </Text>
        ) : null}

        {sent ? (
          <View style={{ gap: theme.spacing[3] }}>
            <Text variant="body">If an account exists for that email, we have sent a reset link.</Text>
            <Button
              label="I have a reset code"
              variant="secondary"
              onPress={() => navigation.navigate('ResetPassword', { email: sentEmail })}
              fullWidth
            />
          </View>
        ) : (
          <Button label="Send reset link" onPress={handleSubmit(onSubmit)} loading={loading} fullWidth />
        )}
      </View>
    </KeyboardAwareScreen>
  )
}

import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { useForm, Controller } from 'react-hook-form'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/shared/navigation/types'
import { useAuthStore } from '@/shared/store/auth'
import * as authApi from '@/shared/api/auth'
import { extractApiError, extractValidationErrors } from '@/shared/api/client'

type FormData = { name: string; email: string; password: string; password_confirmation: string }

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>

export default function RegisterScreen({ navigation }: Props) {
  const { setToken, setUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const { control, handleSubmit, setError, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: { name: '', email: '', password: '', password_confirmation: '' },
  })

  const password = watch('password')

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setServerError('')
    try {
      const res = await authApi.register(data.name, data.email, data.password, data.password_confirmation)
      setToken(res.token)
      setUser(res.user)
    } catch (err) {
      const ve = extractValidationErrors(err)
      const knownFields: (keyof FormData)[] = ['name', 'email', 'password', 'password_confirmation']
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      <Controller
        control={control}
        name="name"
        rules={{ required: 'name is required' }}
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={styles.input}
            placeholder="name"
            autoCapitalize="words"
            keyboardType="default"
            value={value}
            onChangeText={onChange}
          />
        )}
      />
      {errors.name && <Text style={styles.error}>{errors.name.message}</Text>}

      <Controller
        control={control}
        name="email"
        rules={{ required: 'Email is required', pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' } }}
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={styles.input}
            placeholder="email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={value}
            onChangeText={onChange}
          />
        )}
      />
      {errors.email && <Text style={styles.error}>{errors.email.message}</Text>}

      <Controller
        control={control}
        name="password"
        rules={{ required: 'password is required', minLength: { value: 8, message: 'Min 8 characters' } }}
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={styles.input}
            placeholder="password"
            secureTextEntry
            autoCapitalize="none"
            keyboardType="default"
            value={value}
            onChangeText={onChange}
          />
        )}
      />
      {errors.password && <Text style={styles.error}>{errors.password.message}</Text>}

      <Controller
        control={control}
        name="password_confirmation"
        rules={{
          required: 'password confirmation is required',
          validate: (v) => v === password || 'Passwords do not match',
        }}
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={styles.input}
            placeholder="password confirmation"
            secureTextEntry
            autoCapitalize="none"
            keyboardType="default"
            value={value}
            onChangeText={onChange}
          />
        )}
      />
      {errors.password_confirmation && <Text style={styles.error}>{errors.password_confirmation.message}</Text>}

      {serverError ? <Text style={styles.error}>{serverError}</Text> : null}

      <TouchableOpacity style={styles.button} onPress={handleSubmit(onSubmit)} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Already have an account? Login</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', backgroundColor: '#0f1923' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#00b4d8', textAlign: 'center', marginBottom: 24 },
  input: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 16, color: '#fff', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  error: { color: '#ff6b6b', fontSize: 12, marginBottom: 8 },
  button: { backgroundColor: '#00b4d8', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: '#00b4d8', textAlign: 'center', marginTop: 20 },
})

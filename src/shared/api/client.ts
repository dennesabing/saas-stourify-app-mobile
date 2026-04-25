import axios from 'axios'
import { useAuthStore } from '@/shared/store/auth'
import { navigateTo } from '@/shared/navigation/ref'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000/api/v1'

export const client = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 15000,
})

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      navigateTo('Login')
    }
    return Promise.reject(error)
  }
)

export function extractApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? error.message
  }
  return 'Something went wrong.'
}

export function extractValidationErrors(error: unknown): Record<string, string[]> {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.errors ?? {}
  }
  return {}
}

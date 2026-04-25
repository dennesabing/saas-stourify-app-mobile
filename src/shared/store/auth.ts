import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import type { User } from '@/shared/api/types'

const TOKEN_KEY = 'stourify_token'

interface AuthState {
  token: string | null
  user: User | null
  setToken: (token: string) => void
  setUser: (user: User) => void
  clearAuth: () => void
  loadFromStorage: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,

  setToken: (token) => {
    SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {})
    set({ token })
  },

  setUser: (user) => set({ user }),

  clearAuth: () => {
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {})
    set({ token: null, user: null })
  },

  loadFromStorage: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY)
    if (token) set({ token })
  },
}))

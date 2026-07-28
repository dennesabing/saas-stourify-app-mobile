import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { User } from '@/shared/api/types'

const TOKEN_KEY = 'stourify_token'
const USER_KEY = 'stourify_user'

interface AuthState {
  token: string | null
  user: User | null
  setToken: (token: string) => void
  setUser: (user: User) => void
  clearAuth: () => void
  loadFromStorage: () => Promise<void>
}

/**
 * The token lives in SecureStore because it is a credential. The user does NOT:
 * it is not a secret, and a local database keyed to an owner needs a stable
 * identity restored as early in boot as possible — `RootNavigator` calls
 * `loadFromStorage()` in a `useEffect`, so restoration lands shortly AFTER
 * first paint, not before it, but the token and user are seeded atomically in
 * one `set()` call here, so there is never a frame where a restored token is
 * paired with a still-null user. SecureStore's per-item keychain round-trip is
 * the wrong tool for the user object regardless, and nothing calls `getMe()`
 * early enough to substitute for persistence.
 */
export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,

  setToken: (token) => {
    SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {})
    set({ token })
  },

  setUser: (user) => {
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {})
    set({ user })
  },

  clearAuth: () => {
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {})
    AsyncStorage.removeItem(USER_KEY).catch(() => {})
    set({ token: null, user: null })
  },

  loadFromStorage: async () => {
    const [token, rawUser] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      AsyncStorage.getItem(USER_KEY),
    ])

    let user: User | null = null

    if (rawUser !== null) {
      try {
        user = JSON.parse(rawUser) as User
      } catch {
        // A corrupted blob must not brick the boot; the session simply starts
        // without a cached identity and repopulates on the next profile fetch.
        user = null
      }
    }

    set({ token: token ?? null, user })
  },
}))

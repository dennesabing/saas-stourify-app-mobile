import type { TokenStore } from '@soxerp/offline-sync-core'
import { useAuthStore } from '@/shared/store/auth'

/**
 * The engine's token seam (`seams.ts:9-12`), backed by the app's ONE auth store.
 *
 * Deliberately not a second copy of the token: the sync client and the axios
 * client must not be able to drift apart, so both read the same
 * `useAuthStore` state and the same SecureStore write path underneath it.
 */
export const authTokenStore: TokenStore = {
  get: async () => useAuthStore.getState().token,
  set: async (token) => {
    if (token === null) {
      useAuthStore.getState().clearAuth()
      return
    }
    useAuthStore.getState().setToken(token)
  },
}

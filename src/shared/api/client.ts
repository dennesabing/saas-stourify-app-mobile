import axios from 'axios'
import type { AuthRejectionDetail } from '@soxerp/offline-sync-core'
import { useAuthStore } from '@/shared/store/auth'

// `__DEV__`-gated fallback: `10.0.2.2` is the Android emulator's alias for the
// host loopback and resolves to nothing on a real phone. `mobile/.env` is
// gitignored so it never reaches an EAS builder — see `src/sync/httpClient.ts`
// for the full note. `eas.json` sets this explicitly on every build profile.
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://10.0.2.2:8000/api/v1' : 'https://api.stourify.com/api/v1')

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

/**
 * Set by `installSyncSessionHandlers` at app start.
 *
 * A registered handler rather than `import { signOut } from '@/sync/session'`
 * — the same seam `sync/httpClient.ts` uses, and for the same reason. Importing
 * it directly created a require cycle:
 *
 *   client.ts → sync/session.ts → sync/scheduler.ts → sync/cycle.ts
 *             → sync/mediaDrain.ts → shared/api/media.ts → client.ts
 *
 * M4a closed that loop when `mediaDrain` began using the API client. Metro
 * warns about it but still evaluates the modules, so one of them observes its
 * dependency as `undefined` mid-initialisation — a failure that surfaces as a
 * sync layer that silently does nothing rather than as an error.
 */
let authRejectionHandler: ((detail: AuthRejectionDetail) => void) | null = null

export function setApiAuthRejectionHandler(fn: (detail: AuthRejectionDetail) => void): void {
  authRejectionHandler = fn
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // ONE 401 path for both clients. The handler runs `signOut`, which clears
      // the token, wipes the local database, drops the sync cursor and
      // navigates — none of which the old `clearAuth()` + `navigateTo()` pair
      // did.
      //
      // The detail is assembled here rather than left to the handler because
      // this is the only place that still holds the request: afterwards there
      // is nothing left to ask. `credentialSent` reads the header that actually
      // went out, not the token store — the store can have been cleared in the
      // meantime, and the question is what this request carried.
      authRejectionHandler?.({
        status: 401,
        method: String(error.config?.method ?? 'unknown').toUpperCase(),
        path: String(error.config?.url ?? 'unknown'),
        credentialSent: Boolean(error.config?.headers?.Authorization),
      })
    }
    return Promise.reject(error)
  },
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

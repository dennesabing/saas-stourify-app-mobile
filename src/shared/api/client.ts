import axios, { AxiosError } from 'axios'
import type { AuthRejectionDetail } from '@soxerp/offline-sync-core'
import { API_URL } from '@/shared/config/apiUrl'
import { useAuthStore } from '@/shared/store/auth'

// Which backend this talks to is decided in ONE place, `shared/config/apiUrl.ts`
// — read the note there for why it refuses rather than guessing production when
// nothing set an address (STOURIFY-232). This file used to work it out itself,
// and so did two others.

export const client = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 15000,
})

/**
 * When each request set off, so a failure can be measured against its deadline.
 *
 * A `WeakMap` keyed by the request's own config object: axios hands the same
 * object back on the error, and an entry disappears by itself once nothing
 * refers to that request any more — no clean-up, no leak, and no extra field
 * bolted onto axios's config type. See `ranPastItsDeadline` for why this exists.
 */
const startedAt = new WeakMap<object, number>()

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  startedAt.set(config, Date.now())
  return config
})

/**
 * Whether a failure is really our own deadline running out, whatever it is
 * labelled.
 *
 * A kitchen timer that rings, but whose bell is wired to the "gas is off"
 * light. You can rewire the bell, or you can look at the clock: if the light
 * came on at exactly the moment the timer was due, it was the timer.
 *
 * **Why the label is wrong** (STOURIFY-261). On Android, React Native passes
 * axios's `timeout` to OkHttp as a *call timeout*. When it expires OkHttp throws
 * `InterruptedIOException("timeout")`, but React Native only reports a timeout
 * for the narrower `SocketTimeoutException` — it compares the exact class, and
 * a parent class is not the same class. So the request ends as an ordinary
 * `error` event, axios labels it `ERR_NETWORK`, and the screen tells a person
 * with a working connection to check it. Logged on the emulator against a busy
 * rig backend: `code: "ERR_NETWORK"`, no response, `elapsedMs: 15023` against a
 * `timeout` of 15000.
 *
 * **So we read our own clock.** The start is stamped here in JavaScript before
 * the request is handed to native code, so the time we measure is never shorter
 * than the time OkHttp measured: reaching the deadline is exact, with no margin.
 * A genuine network failure — airplane mode, an unreachable host — fails in
 * milliseconds and keeps its `ERR_NETWORK`.
 *
 * ```ts
 * // Rejected: axios's own switch.
 * //   axios.create({ timeout: 15000, transitional: { clarifyTimeoutError: true } })
 * // Tempting because: it is the documented way to get ETIMEDOUT for a timeout.
 * // Why it lost: it only changes the code axios attaches inside `ontimeout`, and
 * // on Android that handler never runs. It would change nothing.
 *
 * // Rejected: error.request?._response === 'timeout'
 * // Tempting because: it is the literal text OkHttp produced, so it is exact.
 * // Why it lost: `_response` is React Native's private field holding an exception
 * // message — free to change in any React Native or OkHttp upgrade, silently.
 * ```
 */
function ranPastItsDeadline(error: unknown): error is AxiosError {
  if (!axios.isAxiosError(error)) return false
  // Only relabel a request that got no answer. A slow 503 is still a 503.
  if (error.response !== undefined || error.code !== AxiosError.ERR_NETWORK) return false

  const timeout = error.config?.timeout ?? 0
  const started = error.config ? startedAt.get(error.config) : undefined
  if (timeout <= 0 || started === undefined) return false

  return Date.now() - started >= timeout
}

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
    if (ranPastItsDeadline(error)) {
      // The same code and wording axios itself uses for a timeout, so
      // `describeRequestFailure` says "took too long" without knowing any of
      // this happened. `response` stays undefined on purpose: the drains and
      // the composer treat "no answer" as "try again later", and still should.
      error.code = AxiosError.ETIMEDOUT
      error.message = `timeout of ${error.config?.timeout}ms exceeded`
    }
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

import {
  createHttpClient,
  type AuthRejectionDetail,
  type HttpClient,
} from '@soxerp/offline-sync-core'
import { API_URL } from '@/shared/config/apiUrl'
import { authTokenStore } from './seams/tokenStore'

/**
 * The app's env var already includes the version segment
 * (`mobile/src/shared/api/client.ts:5`), but `createHttpClient` wants the origin
 * and the api path separately (`httpClient.ts:56`). Split rather than configure
 * twice, so the two clients cannot end up pointed at different hosts.
 */
export function splitApiUrl(url: string): { baseUrl: string; apiPath: string } {
  const trimmed = url.replace(/\/+$/, '')
  const match = trimmed.match(/^(.*)\/(api\/v\d+)$/)

  if (match) return { baseUrl: match[1], apiPath: match[2] }

  return { baseUrl: trimmed, apiPath: 'api/v1' }
}

// The same address the axios client uses, from the one place that decides it
// (`shared/config/apiUrl.ts`) — so the two clients cannot end up pointed at
// different hosts. That file also explains why a build with nothing set refuses
// to start instead of guessing production (STOURIFY-232).
const { baseUrl, apiPath } = splitApiUrl(API_URL)

/**
 * React Native's fetch has NO default timeout, so a stalled socket hangs forever
 * with no error and no offline signal — the sync would sit in a permanent "in
 * progress" with the re-entry mutex held. The abort is tagged as a network
 * failure (`httpClient.ts:90-105`), which is the correct classification for the
 * retry logic: from the caller's side a server that never answers is
 * indistinguishable from one that cannot be reached.
 */
export const SYNC_TIMEOUT_MS = 20000

let authRejectionHandler: (
  reason: 'disabled' | 'unauthenticated',
  detail: AuthRejectionDetail,
) => void = () => {}

/**
 * Registered by whatever module owns session/app bootstrap (a later task —
 * there is no `session.ts` yet) rather than imported directly here, because that
 * module needs this client and importing both ways would be a cycle.
 *
 * Decision for that future wiring (Task 6 left this open, resolved here): the
 * handler should call the SAME teardown the existing axios 401 interceptor uses
 * — `useAuthStore.getState().clearAuth()` + `navigateTo('Login')`
 * (`src/shared/api/client.ts:24-26`) — directly, not `authTokenStore.set(null)`.
 * Two reasons:
 *   1. `authTokenStore.set(null)` and `clearAuth()` already do the same thing
 *      (`clearAuth` IS what `set(null)` calls), so going direct is not a
 *      behavioural loss, just one fewer indirection for a path that isn't a
 *      token-store operation — it's a logout.
 *   2. Task 15 will make logout also wipe the local database and reset sync
 *      cursors. If both the axios 401 path and this sync 401 path call the same
 *      shared teardown function, Task 15's change lands once and covers both
 *      call sites automatically. Routing through the narrower `TokenStore.set`
 *      seam instead would give Task 15 a second, divergent place to patch.
 * `authTokenStore.set(null)` therefore remains dead code until something other
 * than a 401 handler needs to clear just the token — which is fine; it is not
 * removed, only unexercised.
 */
export function setSyncAuthRejectionHandler(
  fn: (reason: 'disabled' | 'unauthenticated', detail: AuthRejectionDetail) => void,
): void {
  authRejectionHandler = fn
}

let reachabilityHandler: (ok: boolean) => void = () => {}

/**
 * Registered by the Sync Status screen / connectivity seam consumer. Exists
 * alongside `setSyncAuthRejectionHandler` for the same reason: this module is
 * created before its consumers, so they push a handler in rather than this
 * module reaching out to them.
 */
export function setSyncReachabilityHandler(fn: (ok: boolean) => void): void {
  reachabilityHandler = fn
}

/**
 * Sync's own client. The screens' axios client (`src/shared/api/client.ts`) is
 * untouched — two clients by design, sharing one token source
 * (`authTokenStore`) and one 401 path (via `setSyncAuthRejectionHandler`).
 *
 * `getOrgId` is deliberately NOT set. The mobile app never sends
 * `X-Organization-Id`; `SetOrganizationFromHeader` falls through when the header
 * is absent and `SetCurrentOrganization` resolves from `current_organization_id`,
 * which M1's explorer onboarding sets. Stourify has no org concept on mobile at
 * all — this app is single-org. `HttpClientOptions.getOrgId` (`httpClient.ts:34`)
 * is left available, unused, for the day that assumption stops holding; this
 * comment is the record that its absence is a choice, not an oversight.
 */
export const syncHttpClient: HttpClient = createHttpClient({
  baseUrl,
  apiPath,
  tokenStore: authTokenStore,
  timeoutMs: SYNC_TIMEOUT_MS,
  onAuthRejection: (reason, detail) => authRejectionHandler(reason, detail),
  onReachability: (ok) => reachabilityHandler(ok),
})

/**
 * Re-arms the one-shot auth latch (`authFired`, `httpClient.ts:57, 62`), which
 * fires `onAuthRejection` once per client instance and then never again. Call on
 * every fresh login, or a 401 after a re-login is silently ignored.
 */
export function resetSyncAuthGuard(): void {
  syncHttpClient.resetAuthGuard()
}

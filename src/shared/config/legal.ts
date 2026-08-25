import { splitApiUrl } from '@/sync/httpClient'

/**
 * URLs of the public legal pages.
 *
 * Google Play requires a privacy-policy URL and a web-reachable account-deletion
 * URL on the store listing, and requires both to be reachable from inside the
 * app. These are the links the Settings screen opens.
 *
 * **Why this is its own setting and no longer derived from the API URL.**
 * It used to take the backend's address and strip the `/api/v1` off the end,
 * which was right while one machine answered to both names. It is not right any
 * more: the backend now lives at `api.stourify.com` and the site people are sent
 * to lives at `stourify.com`. Deriving the second from the first put an
 * API server's hostname in front of a reader who was asked to read a legal
 * document — the address bar said the wrong thing about who they were dealing
 * with, on the one screen where that matters most (STOURIFY-191).
 *
 * So the website address is now stated, not inferred. It still falls back to the
 * old derivation when nothing sets it, because a dev build talking to a laptop
 * has no separate website to point at and the backend does serve these pages.
 */
const RAW_API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://10.0.2.2:8000/api/v1' : 'https://api.stourify.com/api/v1')

/**
 * Origin of the public website.
 *
 * `EXPO_PUBLIC_WEB_URL` when the build sets one; otherwise the backend's own
 * origin, which is what every environment without a separate website wants.
 * A trailing slash is trimmed so the paths below never produce a double one.
 */
export const WEB_BASE_URL = (
  process.env.EXPO_PUBLIC_WEB_URL ?? splitApiUrl(RAW_API_URL).baseUrl
).replace(/\/+$/, '')

export const PRIVACY_POLICY_URL = `${WEB_BASE_URL}/privacy`
export const TERMS_URL = `${WEB_BASE_URL}/terms`
export const ACCOUNT_DELETION_URL = `${WEB_BASE_URL}/account-deletion`

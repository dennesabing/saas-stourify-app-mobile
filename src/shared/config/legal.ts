import { splitApiUrl } from '@/sync/httpClient'

/**
 * URLs of the public legal pages the backend serves.
 *
 * Google Play requires a privacy-policy URL and a web-reachable account-deletion
 * URL on the store listing, and requires both to be reachable from inside the app.
 * The pages are served by our own Laravel backend at unauthenticated routes, so
 * the only thing this module has to do is find the host.
 *
 * It is derived from EXPO_PUBLIC_API_URL rather than written out, because that
 * env var is already the single source of truth for which backend this build
 * talks to (`sync/httpClient.ts`, `shared/api/client.ts`). Hardcoding the
 * production host here would mean a dev build's Privacy Policy link silently
 * opened production — which is exactly the sort of thing nobody notices until the
 * two documents disagree.
 */
const RAW_API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://10.0.2.2:8000/api/v1' : 'https://api.stourify.com/api/v1')

/** Origin of the web app — the API URL with its `/api/v1` suffix removed. */
export const WEB_BASE_URL = splitApiUrl(RAW_API_URL).baseUrl

export const PRIVACY_POLICY_URL = `${WEB_BASE_URL}/privacy`
export const TERMS_URL = `${WEB_BASE_URL}/terms`
export const ACCOUNT_DELETION_URL = `${WEB_BASE_URL}/account-deletion`

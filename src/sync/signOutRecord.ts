import type { AuthRejectionDetail } from '@soxerp/offline-sync-core'

/**
 * The note a shop leaves on the door saying why it closed.
 *
 * The app can end its own session: a `401` from either HTTP client runs
 * `signOut()`, which clears the token, drops the sync cursor, wipes every local
 * row and sends the user back to the login screen. On 2026-08-27 that happened
 * on a real handset with nobody touching it — two airplane-mode cycles and the
 * app was on `Welcome back`. Afterwards there was nothing to read. The database
 * that would have held a clue was the thing that had just been erased.
 *
 * This module is that missing note. It changes nothing about what the app does;
 * it only writes down, at the moment of the decision, what caused it.
 *
 * ## It is deliberately always on
 *
 * `trace.ts` next door is gated behind `EXPO_PUBLIC_SYNC_TRACE`, for two good
 * reasons: a shipped app should not narrate its internals to anyone with a
 * cable, and a log line on a path that runs at every network change costs real
 * time. Neither applies here. This writes at most one line per session, at the
 * one moment the app is already throwing the whole database away, and the line
 * carries a status code, a method, a path, two booleans and two counts — no
 * user content of any kind.
 *
 * And the deciding argument is about *when* you would have to have switched it
 * on. The event has been seen once, unannounced, on a device nobody was
 * watching. A record that has to be armed in advance is a record you do not
 * have the one time it matters.
 */

/** Filter the device log with this: `adb logcat | grep S214`. */
const TAG = 'S214'

/**
 * Who asked for the sign-out.
 *
 * The distinction that matters is the first two against the last two: a person
 * chose, or the app decided. Today both run the same teardown, which is why an
 * automatic sign-out silently gets the consequences a deliberate one was
 * designed for.
 */
export type SignOutTrigger =
  /** The Log out button in Settings. */
  | 'user-logout'
  /** The account was closed or deleted from Settings. */
  | 'account-closed'
  /** The sync client read a response as an auth rejection. */
  | 'sync-client-rejected'
  /** The screens' API client read a response as an auth rejection. */
  | 'api-client-rejected'

export interface SignOutCause {
  trigger: SignOutTrigger
  /**
   * Present only when a real HTTP response caused this. A user tapping Log out
   * has no response behind it, and the record says so with a dash rather than
   * inventing a zero.
   */
  detail?: AuthRejectionDetail
}

/**
 * How much work was still waiting to be sent when the teardown started.
 *
 * This is the number that turns "an annoying logout" into "data loss", so it is
 * read before anything is wiped — read afterwards it is always zero, which
 * would make every record look harmless.
 */
export interface UnsentWork {
  pendingCount: number
  pendingMediaCount: number
}

function orDash(value: string | number | boolean | undefined): string {
  return value === undefined ? '-' : String(value)
}

export function formatSignOutRecord(
  cause: SignOutCause,
  unsent: UnsentWork,
  at: Date = new Date(),
): string {
  const d = cause.detail
  return (
    `${TAG} ${at.toISOString().slice(11, 23)} signOut` +
    ` trigger=${cause.trigger}` +
    ` status=${orDash(d?.status)}` +
    ` method=${orDash(d?.method)}` +
    ` path=${orDash(d?.path)}` +
    ` credentialSent=${orDash(d?.credentialSent)}` +
    ` unsentRows=${unsent.pendingCount}` +
    ` unsentPhotos=${unsent.pendingMediaCount}`
  )
}

export function recordSignOut(cause: SignOutCause, unsent: UnsentWork): void {
  // eslint-disable-next-line no-console
  console.log(formatSignOutRecord(cause, unsent))
}

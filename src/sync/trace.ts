/**
 * A tracker you stick on a parcel that did not arrive.
 *
 * The app has a fault where it knows perfectly well that the network is back —
 * its own connectivity flag says `online` and keeps saying it — and yet no
 * request of any kind leaves the phone. That was measured on real hardware
 * under STOURIFY-134, and it rules out everything upstream of the sync cycle.
 * What is left is the cycle itself, which has one latch and five ways to end
 * early, and from outside all six outcomes look exactly the same: silence.
 *
 * This module is what turns that silence into a sentence. It does not change
 * what the app does — nothing here writes to any state the app reads — it only
 * reports what happened, in order, with times.
 *
 * ## It is off unless you switch it on
 *
 * Set `EXPO_PUBLIC_SYNC_TRACE=1` in the environment the bundle is built in.
 * Anything else, including unset, and every call here returns immediately.
 * `mobile/docs/instrumenting-a-sync-cycle.md` has the build recipe and how to
 * read the output.
 *
 * Two reasons it is not simply always on. A shipped app that narrates its sync
 * internals into the phone's system log is telling anyone with a cable more
 * than it was asked to, and the log line costs time on the JavaScript thread in
 * a path that runs on every single network change — a cost paid by every user
 * to serve an investigation that happens once a year.
 *
 * The flag is read on **every** call rather than once when this file loads.
 * That is deliberate: a value captured at load time cannot be changed by a test
 * without tearing down and rebuilding the module registry, and `cycle.ts`
 * imports this file, so that teardown would spread across the suite. One
 * property read and one string comparison is nothing next to a function that
 * makes network requests.
 */

/** Filter the device log with this: `adb logcat | grep S220`. */
const TAG = 'S220'

export function isSyncTraceEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SYNC_TRACE === '1'
}

/**
 * Write one line, if tracing is on.
 *
 * The time comes first and to the millisecond, because the whole question this
 * instrument answers is about *gaps* — how long a cycle has been holding the
 * latch, how long after the connectivity edge the first request went out. A log
 * without milliseconds cannot answer either.
 */
export function syncTrace(line: string): void {
  if (!isSyncTraceEnabled()) return

  // eslint-disable-next-line no-console
  console.log(`${TAG} ${new Date().toISOString().slice(11, 23)} ${line}`)
}

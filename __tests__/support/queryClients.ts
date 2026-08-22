import type { QueryClient } from '@tanstack/react-query'

/**
 * Registers a React Query cache so it is shut down when the test file ends.
 *
 * A shop that locks up for the night but leaves an oven timer running cannot set
 * the alarm and go home. Node is the same: it exits when there is nothing left
 * to do, and one pending `setTimeout` counts as something left to do however far
 * away it is set for.
 *
 * React Query starts exactly such a timer for everything it holds — a cached
 * request, and also a finished mutation — saying *after `gcTime`, throw this
 * away*. The library's default window is five minutes; the app's own
 * `createQueryClient()` raises it to a full day, and is right to, because an
 * entry has to survive in memory long enough for the persister to write it to
 * the phone. Either way the timer outlives the test that made it, and jest then
 * prints a green tally and sits there — for five minutes, or for as long as
 * anybody is willing to wait (STOURIFY-144).
 *
 * **Every `QueryClient` a test builds goes through here** — the same rule
 * `testDatabase.ts` states for `LokiJSAdapter`, and for the same reason.
 *
 * Two things make the blunt rule the right one, and both were learned the
 * expensive way:
 *
 * - **`gcTime: 0` is not an exemption.** Several tests already pass
 *   `defaultOptions.queries.gcTime = 0`, and that genuinely does disarm the
 *   query half. It does nothing at all for the mutation half, which keeps the
 *   library's five-minute default — so a screen test that taps a button and
 *   fires one mutation leaves a five-minute timer behind while looking, at every
 *   call site, as though it had been careful.
 * - **Lowering `gcTime` everywhere is the wrong fix anyway.** It changes the
 *   object under test, and a test that seeds a cache and then renders a screen
 *   needs the entry to still be there when the screen looks for it —
 *   `NearbyScreen.test.tsx` says exactly that in its own comment.
 *
 * Importing this module registers the teardown in the importing test file. That
 * is how jest hooks work: a hook declared at module scope binds to whichever
 * file pulled the module in.
 */
const openClients: QueryClient[] = []

export function trackQueryClient(client: QueryClient): QueryClient {
  openClients.push(client)
  return client
}

/**
 * Empties both halves of a cache, and cancels the timers attached to what was
 * in them.
 *
 * The mutations are destroyed by hand, and that is not belt-and-braces either.
 * The two halves of the library disagree: emptying the query half destroys each
 * query on the way out, so its timer goes with it, while emptying the mutation
 * half only forgets the mutations — their timers keep running with nothing left
 * pointing at them. Same method name on both, opposite effect, and it is the
 * reason the suite still sat for five minutes after every cache had supposedly
 * been cleared.
 */
function closeOpenClients() {
  for (const client of openClients) {
    for (const mutation of client.getMutationCache().getAll()) {
      mutation.destroy()
    }
    client.clear()
  }
}

// Once between tests, to keep a long file from piling caches up, and once more
// at the end. The second pass is not belt-and-braces: React Query schedules a
// mutation's collection timer when its last observer goes away, and the thing
// that takes the observer away is React Testing Library unmounting the tree in
// its OWN `afterEach`. Whichever of the two hooks runs first, the other has to
// come along behind it — and only `afterAll` is guaranteed to be behind both.
//
// Clearing between tests is also why this is a hook rather than a line at the
// end of each test body: a cleanup written inline is skipped whenever the test
// fails early, which is precisely when a left-behind timer is least welcome.
afterEach(closeOpenClients)

afterAll(() => {
  closeOpenClients()
  openClients.length = 0
})

import { AxiosError } from 'axios'

/**
 * What a screen should put in front of a person when a request failed.
 *
 * Three fields because that is exactly what `EmptyState` takes — an icon, a
 * headline, and a sentence underneath it. Nothing here decides layout; it
 * decides words.
 */
export interface RequestFailureMessage {
  icon: string
  title: string
  subtitle: string
}

/**
 * The refusals the server names, and what each one should say to a person.
 *
 * A `403` on its own is the server saying "no" without saying which no it
 * meant, and the two it can mean want opposite things from the reader. Being
 * told you lack a permission is a dead end — there is nothing you can do about
 * it from inside the app. Being told your account was never finished being set
 * up is the opposite: there is one cheap thing to try, and one person to ask if
 * it does not work.
 *
 * The codes are the ones `GET /api/v1/feed` sends (STOURIFY-228). They are
 * unique across the whole API, so keeping the mapping in this shared function —
 * rather than in a feed-only copy of it — cannot misfire on another screen, and
 * it keeps one home for everything the app says about a refusal.
 *
 * Anything not in this table falls through to the generic wording below. That
 * fall-through is the part protecting the other screens: an unrecognised code
 * is not a licence to guess.
 */
const REFUSALS: Record<string, Omit<RequestFailureMessage, 'title'>> = {
  NO_ORGANIZATION: {
    icon: '🪪',
    subtitle:
      "Your account hasn't been added to a Stourify organization yet, so there's no feed to " +
      'show. Signing out and back in usually sorts it — if it keeps happening, ask whoever set ' +
      'up your Stourify account.',
  },
  FEED_ACCESS_DENIED: {
    icon: '🔒',
    subtitle: "This account isn't allowed to view posts in its organization.",
  },
}

/**
 * The response body, if it is an object at all.
 *
 * Written to survive whatever actually comes back rather than what the API
 * documents: a body can be a bare string from a proxy, `null` from an empty
 * response, or an object shaped nothing like the contract. None of those may
 * throw on the way to producing an error message — a crash while explaining a
 * failure is a worse failure than the one it was explaining.
 */
function responseBody(error: unknown): Record<string, unknown> | undefined {
  if (!(error instanceof AxiosError)) return undefined

  const data: unknown = error.response?.data
  if (typeof data !== 'object' || data === null) return undefined

  return data as Record<string, unknown>
}

/** The `code` the server put on a refusal, if it put one there. */
function refusalCode(error: unknown): string | undefined {
  const code = responseBody(error)?.code

  return typeof code === 'string' ? code : undefined
}

/**
 * The first thing the server said about a field it rejected, if it said one.
 *
 * A `422` from this API carries `errors: { field: ['message', …] }`, and those
 * messages are written for the person who typed the value — "The body field
 * must not be greater than 2000 characters." — so they are passed on rather
 * than paraphrased. Anything not shaped like that yields nothing, and the
 * caller falls back to its own words.
 */
function firstFieldMessage(error: unknown): string | undefined {
  const errors = responseBody(error)?.errors
  if (typeof errors !== 'object' || errors === null) return undefined

  for (const messages of Object.values(errors)) {
    if (Array.isArray(messages) && typeof messages[0] === 'string') return messages[0]
  }

  return undefined
}

/**
 * What actually went wrong, before anybody chooses words for it.
 *
 * Split out under STOURIFY-252 so a failed load and a failed send can read the
 * failure the same way and still say different things about it. A reader whose
 * page did not load wants to know whether to wait or give up; a reader whose
 * note did not post still has it in the box and wants to know whether pressing
 * post again will work. Same fact, different remedy — so one reading, two
 * wording tables.
 */
type FailureCause =
  | { kind: 'unreachable' }
  | { kind: 'timed-out' }
  | { kind: 'cancelled' }
  | { kind: 'session-ended' }
  | { kind: 'refused'; code: string | undefined }
  | { kind: 'not-found' }
  | { kind: 'invalid'; fieldMessage: string | undefined }
  | { kind: 'too-fast' }
  | { kind: 'server-fault' }
  | { kind: 'unknown' }

/**
 * Read a failed request down to one cause.
 *
 * **The mechanism, precisely.** An axios failure carries a `response` object
 * when the server answered — even when it answered badly — and carries none at
 * all when the request never produced one. So `error.response` separates "the
 * server said something" from "the server said nothing", and `response.status`
 * says which something. Both facts are already in the caller's hands; this
 * function only reads them.
 *
 * Anything that is not an axios error is `unknown` rather than a guess.
 */
function causeOf(error: unknown): FailureCause {
  if (error instanceof AxiosError && error.response === undefined) {
    // No response at all. Two very different reasons land here and axios tells
    // them apart with `code`: the request was abandoned on our own deadline, or
    // it never got anywhere. Saying "check your connection" to the first is the
    // same mistake as saying it to a 403 — the connection worked, the server was
    // just slow. `mobile/src/shared/api/client.ts` gives every screen request 15
    // seconds, and STOURIFY-229 records a feed page measured at about 17.
    //
    // On Android that deadline used to arrive here disguised as `ERR_NETWORK`
    // and got the connection wording; `client.ts` → `ranPastItsDeadline`
    // relabels it `ETIMEDOUT` before it gets this far (STOURIFY-261).
    if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
      return { kind: 'timed-out' }
    }

    // Cancelled on purpose — an abort signal fired. Nothing happened to the
    // connection. React Query's own cancellations never reach a screen as an
    // error; only an axios cancel can.
    if (error.code === AxiosError.ERR_CANCELED) return { kind: 'cancelled' }

    return { kind: 'unreachable' }
  }

  const status = error instanceof AxiosError ? error.response?.status : undefined

  if (status === 401) return { kind: 'session-ended' }
  if (status === 403) return { kind: 'refused', code: refusalCode(error) }
  if (status === 404) return { kind: 'not-found' }
  if (status === 422) return { kind: 'invalid', fieldMessage: firstFieldMessage(error) }
  if (status === 429) return { kind: 'too-fast' }
  if (status !== undefined && status >= 500) return { kind: 'server-fault' }

  return { kind: 'unknown' }
}

/**
 * Turn a failed request into words that match what actually went wrong.
 *
 * Imagine ringing a shop and getting five different outcomes — nobody picks up,
 * they pick up and put you on hold forever, they say you are not a member, they
 * say the thing you asked about does not exist, or the phone system falls over.
 * Reporting all five as "the line is dead" is not a small imprecision. It sends
 * the caller to check their own phone every time, and only one of the five is
 * their phone's fault.
 *
 * That was the app until STOURIFY-225. Thirteen screens showed one sentence —
 * "We couldn't reach Stourify just now. Check your connection and try again." —
 * for every possible failure. On the test handset it was shown to somebody
 * whose connection was demonstrably fine: the sync layer was talking to that
 * same server in the same seconds, and the feed's own request had been answered
 * with `403 This action is unauthorized.` The screen was holding that answer
 * and never looked at it.
 *
 * The reading is `causeOf` above; this function is only the words. Since
 * STOURIFY-237 a refusal's `code` picks among `REFUSALS`. A `422` has no
 * wording of its own here — a load has no fields to reject — and gets the
 * generic sentence, exactly as it did before the cause step was split out.
 *
 * `title` is deliberately the same in every branch. "Couldn't load your feed"
 * is true whatever went wrong, and it is the line a reader takes in first — the
 * explanation is what has to vary, not the headline.
 *
 * @param error   Whatever the query layer rejected with. Anything that is not
 *                an axios error falls through to the generic wording rather
 *                than guessing.
 * @param subject What would not load, in the reader's words, and phrased to sit
 *                after "Couldn't load" — `'your feed'`, `'this profile'`.
 */
export function describeRequestFailure(error: unknown, subject: string): RequestFailureMessage {
  const title = `Couldn't load ${subject}`
  const cause = causeOf(error)

  switch (cause.kind) {
    case 'timed-out':
      return {
        icon: '🐢',
        title,
        subtitle: 'Stourify took too long to answer. Give it a moment and try again.',
      }

    case 'cancelled':
      return {
        icon: '⏹️',
        title,
        subtitle: 'Loading stopped before Stourify answered. Try again.',
      }

    case 'unreachable':
      return {
        icon: '📡',
        title,
        subtitle: "We couldn't reach Stourify just now — check your connection and try again.",
      }

    case 'session-ended':
      return {
        icon: '🔑',
        title,
        subtitle: 'Your session has ended. You need to be signed in again to see this.',
      }

    case 'refused': {
      const refusal = cause.code === undefined ? undefined : REFUSALS[cause.code]

      return {
        icon: refusal?.icon ?? '🔒',
        title,
        // No mention of the network in any branch, on purpose, and a test pins
        // that: this is the exact case that was sending people to look at their
        // router.
        subtitle:
          refusal?.subtitle ??
          "This account isn't allowed to see this. Nothing on your end is broken.",
      }
    }

    case 'not-found':
      return {
        icon: '🔍',
        title,
        subtitle: "Stourify couldn't find this. It may have been removed.",
      }

    case 'too-fast':
      return {
        icon: '⏳',
        title,
        subtitle: "You're asking a bit too quickly. Wait a few seconds and try again.",
      }

    case 'server-fault':
      return {
        icon: '⚠️',
        title,
        subtitle: "Something went wrong on Stourify's end. Try again in a moment.",
      }

    case 'invalid':
    case 'unknown':
      return {
        icon: '⚠️',
        title,
        subtitle: 'Something went wrong. Try again in a moment.',
      }
  }
}

/**
 * The same honesty for a write: one line saying why something did not send.
 *
 * STOURIFY-252. The note composer on a spot's About tab answered every failure
 * with "That didn't send. Check your connection and try again." — the read
 * screens' old fault, pointed at a write. A sibling rather than a verb argument
 * on `describeRequestFailure`, because the two differ in whole sentences, not a
 * word: a send that timed out may still have landed, and a `422` is the main
 * way a send is refused while it means nothing for a load. The card records the
 * decision and the options that lost.
 *
 * One string rather than icon/title/subtitle, because its caller is a text
 * field's error line. It opens with the same "That didn't send." every time —
 * the constant headline, as on the read side — and the reason follows.
 *
 * A refusal's `code` is not consulted: the only codes the API sends today come
 * from reading the feed, which is never a send. When a write starts sending
 * one, give it a row here the way `REFUSALS` does for reads.
 *
 * The wording names a note and a spot because the composer is the only caller.
 * A second caller should add a subject rather than inherit words about notes.
 */
export function describeSendFailure(error: unknown): string {
  const cause = causeOf(error)

  return `That didn't send. ${sendReason(cause)}`
}

function sendReason(cause: FailureCause): string {
  switch (cause.kind) {
    case 'unreachable':
      // The original sentence, kept word for word for the one case it was true.
      return 'Check your connection and try again.'

    case 'timed-out':
      // The server can finish a write after the app stops waiting. The list
      // refetches when the send settles, so a note that did land shows up —
      // which makes "look first" the honest advice, not "post it again".
      return "Stourify took too long to answer. If your note doesn't appear above, try again."

    case 'cancelled':
      return 'It stopped before Stourify answered. Try again.'

    case 'session-ended':
      return 'Your session has ended. Sign in again to post this.'

    case 'refused':
      return "This account isn't allowed to post here. Nothing on your end is broken."

    case 'not-found':
      return "Stourify couldn't find this spot. It may have been removed."

    case 'invalid':
      return cause.fieldMessage ?? "Stourify couldn't accept it as written."

    case 'too-fast':
      return "You're posting a bit too quickly. Wait a few seconds and try again."

    case 'server-fault':
      return "Something went wrong on Stourify's end. Try again in a moment."

    case 'unknown':
      return 'Something went wrong. Try again in a moment.'
  }
}

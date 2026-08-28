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
 * **The mechanism, precisely.** An axios failure carries a `response` object
 * when the server answered — even when it answered badly — and carries none at
 * all when the request never produced one. So `error.response` separates "the
 * server said something" from "the server said nothing", and `response.status`
 * says which something. Both facts are already in the caller's hands; this
 * function only reads them.
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

  if (error instanceof AxiosError && error.response === undefined) {
    // No response at all. Two very different reasons land here and axios tells
    // them apart with `code`: the request was abandoned on our own deadline, or
    // it never got anywhere. Saying "check your connection" to the first is the
    // same mistake as saying it to a 403 — the connection worked, the server was
    // just slow. `mobile/src/shared/api/client.ts` gives every screen request 15
    // seconds, and STOURIFY-229 records a feed page measured at about 17.
    if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
      return {
        icon: '🐢',
        title,
        subtitle: 'Stourify took too long to answer. Give it a moment and try again.',
      }
    }

    return {
      icon: '📡',
      title,
      subtitle: "We couldn't reach Stourify just now — check your connection and try again.",
    }
  }

  const status = error instanceof AxiosError ? error.response?.status : undefined

  if (status === 401) {
    return {
      icon: '🔑',
      title,
      subtitle: 'Your session has ended. You need to be signed in again to see this.',
    }
  }

  if (status === 403) {
    return {
      icon: '🔒',
      title,
      // No mention of the network, on purpose, and a test pins that: this is the
      // exact case that was sending people to look at their router.
      subtitle: "This account isn't allowed to see this. Nothing on your end is broken.",
    }
  }

  if (status === 404) {
    return {
      icon: '🔍',
      title,
      subtitle: "Stourify couldn't find this. It may have been removed.",
    }
  }

  if (status === 429) {
    return {
      icon: '⏳',
      title,
      subtitle: "You're asking a bit too quickly. Wait a few seconds and try again.",
    }
  }

  if (status !== undefined && status >= 500) {
    return {
      icon: '⚠️',
      title,
      subtitle: "Something went wrong on Stourify's end. Try again in a moment.",
    }
  }

  return {
    icon: '⚠️',
    title,
    subtitle: 'Something went wrong. Try again in a moment.',
  }
}

/**
 * Reading the hashtags out of a piece of text, on the phone.
 *
 * ## Why this exists at all when the server already does it
 *
 * This is a deliberate mirror of
 * `modules/Stourify/src/Support/Hashtags/HashtagParser.php`, and the
 * duplication is unavoidable rather than an oversight: one is PHP running on a
 * server, the other is JavaScript running on a phone that may have no signal.
 *
 * What stops the duplication mattering is that **the server is authoritative**.
 * Its copy decides what is stored; this copy only decides what the app
 * underlines in text it is already holding. So a drift between the two shows a
 * word rendered plainly for a moment and then corrected — never two different
 * databases.
 *
 * The reason it has to be local is the offline case. A post written in a tunnel
 * sits in the send-later queue and has never been near the server, so it has no
 * `tags` array to render from. It does have its caption, and that is enough
 * (STOURIFY-103, decision 7).
 *
 * ## The rules, and the two that are not obvious
 *
 * A tag is `#` followed by 1 to {@link MAX_LENGTH} characters drawn from
 * letters, digits and `_`. Anything else ends it, so `#food.` is `food`.
 * Letters from any script count — this is a travel app, and refusing `#東京`
 * would make the feature useless outside English.
 *
 * **A hash glued to the end of a word is not a tag.** `C#` and `route#5` are
 * not tags, so a match whose preceding character is itself a letter, digit or
 * underscore is thrown away.
 *
 * **Except when that character was the tail of the tag before it.**
 * `#food#drink` is two tags, which is what people actually type. Written as a
 * lookbehind, the rule above kills the second one — the character before its
 * `#` is the `d` of `food`. So matches are walked with their indices and one is
 * accepted when the character before it is not a word character **or** the
 * previous accepted match ended exactly where this one starts. A regular
 * expression cannot express that on its own, which is why this is a loop rather
 * than one clever pattern.
 *
 * ## Two answers from one set of rules
 *
 * {@link hashtagsIn} returns the distinct slugs, which is what a caller asking
 * *what is this post about* wants. {@link splitOnHashtags} returns the text cut
 * into pieces, which is what a renderer wants — and it keeps repeats, because
 * both occurrences are on screen and both have to be tappable.
 */

/**
 * Characters after the `#`, at most. A longer run is not an error — the match
 * simply stops here and the remainder stays ordinary text.
 */
const MAX_LENGTH = 64

/**
 * Tags kept per piece of text. Beyond this they are ignored rather than
 * refused: somebody's caption is never rejected over this.
 */
const MAX_TAGS = 30

/** A tag must contain at least one letter or underscore, so `#2026` is not one. */
const HAS_LETTER = /[\p{L}_]/u

/** What may precede a `#` without swallowing it into the word before. */
const WORD_CHARACTER = /[\p{L}\p{N}\p{M}_]/u

const PATTERN = new RegExp(`#([\\p{L}\\p{N}\\p{M}_]{1,${MAX_LENGTH}})`, 'gu')

/** One hashtag found in the text, with where it sits. */
interface Match {
  /** The word as written, without the `#`. */
  word: string
  /** Index of the `#`. */
  start: number
  /** Index one past the last character of the word. */
  end: number
}

/**
 * Every hashtag in `text`, in the order written, keeping repeats.
 *
 * The shared core both public functions are built on, so the rules exist once.
 */
function matches(text: string): Match[] {
  const found: Match[] = []
  let previousEnd: number | null = null

  PATTERN.lastIndex = 0

  for (const match of text.matchAll(PATTERN)) {
    const start = match.index ?? 0
    const word = match[1]
    const end = start + 1 + word.length

    if (!startsHere(text, start, previousEnd)) {
      continue
    }

    // Accepted as a boundary even when it is not kept as a tag, so `#2026#food`
    // still yields `food` — the same rule the PHP original applies.
    previousEnd = end

    if (!HAS_LETTER.test(word)) {
      continue
    }

    found.push({ word, start, end })

    if (found.length === MAX_TAGS) {
      break
    }
  }

  return found
}

/**
 * May a tag begin at this `#`?
 *
 * Yes when nothing precedes it, when what precedes it is not part of a word, or
 * when the tag before it ended on this very character — the `#food#drink` case.
 */
function startsHere(text: string, start: number, previousEnd: number | null): boolean {
  if (start === 0 || previousEnd === start) {
    return true
  }

  // One code point back rather than one unit: JavaScript strings are UTF-16, so
  // a character outside the basic plane occupies two units and reading a single
  // one would compare half of a surrogate pair against a letter class.
  const before = Array.from(text.slice(0, start)).pop() ?? ''

  return !WORD_CHARACTER.test(before)
}

/**
 * The distinct hashtag slugs in `text`, lowercased, in the order they appear.
 *
 * `#Food … #food` is one slug: the two words are the same tag, and the first
 * spelling is the one the server keeps for display.
 */
export function hashtagsIn(text?: string | null): string[] {
  if (!text) {
    return []
  }

  const slugs: string[] = []

  for (const { word } of matches(text)) {
    const slug = word.toLowerCase()

    if (!slugs.includes(slug)) {
      slugs.push(slug)
    }
  }

  return slugs
}

/** One piece of a caption: ordinary text, or a hashtag to be rendered as a link. */
export type TextSegment =
  { kind: 'text'; text: string } | { kind: 'hashtag'; text: string; slug: string }

/**
 * `text` cut into the pieces a renderer needs, in order, so each can be styled.
 *
 * Repeats are kept, unlike {@link hashtagsIn}: if somebody wrote `#food` twice,
 * both words are on screen and both have to be tappable.
 */
export function splitOnHashtags(text?: string | null): TextSegment[] {
  if (!text) {
    return []
  }

  const segments: TextSegment[] = []
  let cursor = 0

  for (const { word, start, end } of matches(text)) {
    if (start > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, start) })
    }

    segments.push({ kind: 'hashtag', text: `#${word}`, slug: word.toLowerCase() })
    cursor = end
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) })
  }

  return segments
}

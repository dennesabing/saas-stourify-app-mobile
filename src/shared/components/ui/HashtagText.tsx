import { type TextProps as RNTextProps, Text as RNText } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import { splitOnHashtags } from '@/shared/utils/hashtags'
import Text, { type TextProps } from './Text'

interface Props extends Omit<TextProps, 'children'> {
  /** The caption or description as the author wrote it. */
  text?: string | null
  /** Called with the tag's slug — lowercased — when one is pressed. */
  onPressHashtag: (slug: string) => void
}

/**
 * A caption or a spot description, with its hashtags rendered as links.
 *
 * ## Why one Text with nested Text, and not a row of Views
 *
 * A caption is a paragraph: it wraps, and a hashtag sits mid-sentence. A `View`
 * per word cannot wrap inside a line — React Native lays views out as blocks —
 * so a row of pressable chips would break the sentence into stacked boxes.
 * Nested `Text` is the one construction where a pressable run flows inline with
 * the words either side of it and the whole paragraph still wraps.
 *
 * That is also why `numberOfLines` on the outer element still works, which
 * matters: `PostCard` truncates a caption to two lines and would otherwise have
 * lost that.
 *
 * ## Why the words come from the text and not from the API
 *
 * The response carries a `tags` array, and reading it would be simpler and
 * correct by construction. It is not used, because a post written with no
 * signal is sitting in the send-later queue and has never reached the server —
 * so it has no `tags` array at all, and its hashtags would be invisible at
 * exactly the moment somebody is most likely to be looking at it. The caption
 * is already in hand, and {@link splitOnHashtags} is enough
 * (STOURIFY-103 decision 7, STOURIFY-173).
 *
 * The server stays authoritative for what is *stored*. This decides only what
 * is underlined.
 */
export default function HashtagText({ text, onPressHashtag, ...rest }: Props) {
  const theme = useTheme()
  const segments = splitOnHashtags(text)

  if (segments.length === 0) {
    return null
  }

  return (
    <Text {...rest}>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          // eslint-disable-next-line react/no-array-index-key -- the list is derived from one immutable string, so an index is stable for its lifetime
          <RNText key={index}>{segment.text}</RNText>
        ) : (
          <RNText
            // eslint-disable-next-line react/no-array-index-key -- see above
            key={index}
            accessibilityRole="link"
            accessibilityLabel={`Hashtag ${segment.slug}`}
            style={{ color: theme.colors.primary }}
            onPress={() => onPressHashtag(segment.slug)}
            suppressHighlighting
          >
            {segment.text}
          </RNText>
        ),
      )}
    </Text>
  )
}

export type HashtagTextProps = Props & RNTextProps

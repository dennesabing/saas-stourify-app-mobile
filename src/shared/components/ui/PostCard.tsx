import React, { useId } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '@/theme/ThemeProvider'
import type { Post } from '@/shared/api/types'
import Avatar from './Avatar'
import Card from './Card'
import HashtagText from './HashtagText'
import Icon from './Icon'
import Tag from './Tag'
import Text from './Text'

interface Props {
  post: Post
  onPress: () => void
  onLikePress?: () => void
  /**
   * Opens the author's profile. Optional, and the identity block is inert
   * without it — a card rendered somewhere with no profile route (a picker, a
   * preview) must not offer a tap that goes nowhere.
   */
  onAuthorPress?: () => void
  /**
   * Opens the per-post overflow — Report, today. Optional for the same reason
   * `onAuthorPress` is: a card rendered in a picker or a preview has nothing to
   * report to, and a control that does nothing is worse than no control.
   */
  onMorePress?: () => void
  /**
   * Opens a hashtag from the caption. Optional for exactly the reason
   * `onAuthorPress` is: a card rendered somewhere with no tag route — a picker,
   * a preview — must not offer a tap that goes nowhere, so without it the
   * hashtags render as ordinary text (STOURIFY-173).
   */
  onHashtagPress?: (slug: string) => void
  /**
   * Opens the spot named on the card's pill — the design's "→ Spot" path from a
   * feed card (STOURIFY-260). Optional, and the pill is a plain label without
   * it, for the same reason as every handler above.
   */
  onSpotPress?: () => void
}

/** The design's feed photo: full card width, a fixed 270 tall (artboard 1). */
const PHOTO_HEIGHT = 270

/**
 * A feed row, drawn as the Home Feed design's card (STOURIFY-260, artboard 1):
 * the photo on top with the spot named in a white pill over it, then the
 * author, the spot's category tags, the caption, and the like/comment row.
 *
 * Renders from `PostResource`'s nested `author` — which is `whenLoaded('user')`
 * server-side and so is genuinely absent on some paths. Never crash on that;
 * fall back to "Unknown" and an initial-less avatar.
 *
 * First photo only: a feed row is a summary, and the post detail screen is
 * where the rest belong. `thumb_url` is preferred when present, but the platform
 * only generates a `thumb` conversion for avatars, so `url` is the normal case.
 *
 * What the artboard draws and this card deliberately does not — a Follow button
 * (a post's author carries no follow state), a bookmark (there is no saving), a
 * share arrow (no messaging, no public link) — is named on STOURIFY-260 rather
 * than drawn as a control that does nothing.
 *
 * The identity block is its own tap-target, nested inside the card's own
 * pressable: tapping the avatar or the name opens the AUTHOR, tapping anywhere
 * else opens the POST. Until STOURIFY-35 it was an inert `View`, which is what
 * made a feed row a dead end — the parent card's "a spot with an author you
 * cannot tap is a broken loop".
 */
function PostCard({
  post,
  onPress,
  onLikePress,
  onAuthorPress,
  onMorePress,
  onHashtagPress,
  onSpotPress,
}: Props) {
  const theme = useTheme()
  const author = post.author
  const liked = post.is_liked === true
  const photo = post.media?.[0]
  const spot = post.spot
  const categories = spot?.categories ?? []
  // Both conditions matter: no handler means nothing to open, and no author
  // means no `uuid` to open it WITH — `author` is `whenLoaded('user')` and is
  // genuinely absent on some paths.
  const authorIsTappable = onAuthorPress !== undefined && author !== undefined
  // See `MosaicTile` for why the id is generated and why it is stripped of
  // punctuation: a fixed id would make every card point at one gradient.
  const fadeId = 'post-card-fade-' + useId().replace(/[^A-Za-z0-9_-]/g, '')

  const spotPill = spot ? (
    <Pressable
      onPress={onSpotPress}
      disabled={!onSpotPress}
      accessibilityRole={onSpotPress ? 'button' : undefined}
      accessibilityLabel={onSpotPress ? `View ${spot.title}` : undefined}
      hitSlop={theme.spacing[2]}
      style={[styles.row, styles.spotPill, { backgroundColor: theme.colors.card }]}
    >
      <Icon name="pin" size={12} />
      {/* Caption's own Inter Medium, not the design's 600: on the Pixel10 a
          one-line Inter SemiBold run inside a content-sized pill is measured
          short and ellipsised early ("SM City Gen…"). STOURIFY-263 tracks it. */}
      <Text variant="caption" numberOfLines={1} style={styles.spotPillText}>
        {spot.title}
      </Text>
    </Pressable>
  ) : null

  return (
    <Card
      onPress={onPress}
      padded={false}
      accessibilityLabel={`Post by ${author?.name ?? 'Unknown'}`}
      style={styles.card}
    >
      {photo ? (
        <View style={{ height: PHOTO_HEIGHT }}>
          <Image
            source={{ uri: photo.thumb_url ?? photo.url }}
            // The colour is theme-dependent, so it cannot live in the static
            // StyleSheet below. Without it the box declared no background at all
            // and showed whatever sat behind it while the image loaded
            // (STOURIFY-102).
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surfaceAlt }]}
            resizeMode="cover"
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Photo in post by ${author?.name ?? 'Unknown'}`}
          />
          {/* The design's fade: dark at the top edge (so the white pill reads
              on a bright sky) and at the bottom, clear through the middle. */}
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.colors.scrim} stopOpacity={0.5} />
                <Stop offset="0.26" stopColor={theme.colors.scrim} stopOpacity={0} />
                <Stop offset="0.6" stopColor={theme.colors.scrim} stopOpacity={0} />
                <Stop offset="1" stopColor={theme.colors.scrim} stopOpacity={0.6} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fadeId})`} />
          </Svg>
          {spotPill ? <View style={styles.pillOnPhoto}>{spotPill}</View> : null}
        </View>
      ) : null}

      <View style={styles.body}>
        {/* Three nested tap-targets in one row, each with its own job: the
            identity opens the author, the overflow opens the post's menu, and the
            card behind them opens the post. */}
        <View style={styles.row}>
          <Pressable
            onPress={authorIsTappable ? onAuthorPress : undefined}
            disabled={!authorIsTappable}
            accessibilityRole={authorIsTappable ? 'button' : undefined}
            accessibilityLabel={
              authorIsTappable ? `${author?.name ?? 'Unknown'}'s profile` : undefined
            }
            style={[styles.row, styles.identity, { minHeight: theme.minTouchTarget }]}
          >
            <Avatar uri={author?.avatar_url} name={author?.name} size={30} />
            <Text
              variant="caption"
              numberOfLines={1}
              style={[styles.name, { fontFamily: theme.fontFamily.bodySemiBold }]}
            >
              {author?.name ?? 'Unknown'}
            </Text>
          </Pressable>

          {onMorePress ? (
            <Pressable
              onPress={onMorePress}
              accessibilityRole="button"
              accessibilityLabel="More options for this post"
              style={[
                styles.center,
                { minWidth: theme.minTouchTarget, minHeight: theme.minTouchTarget },
              ]}
            >
              <Icon name="more" size={20} color="muted" />
            </Pressable>
          ) : null}
        </View>

        {/* With no photo to float it over, the spot pill joins the body. */}
        {!photo && spotPill ? <View style={styles.pillInBody}>{spotPill}</View> : null}

        {categories.length > 0 ? (
          <View style={[styles.row, styles.tags]}>
            {categories.map((category) => (
              <Tag key={category} label={category} />
            ))}
          </View>
        ) : null}

        {post.caption ? (
          // `numberOfLines` still works because HashtagText is one Text with
          // nested Text runs rather than a row of views — see its docblock. A
          // caption with no hashtag renders byte-identically to before.
          onHashtagPress ? (
            <HashtagText
              text={post.caption}
              onPressHashtag={onHashtagPress}
              variant="caption"
              color="muted"
              numberOfLines={2}
              style={styles.caption}
            />
          ) : (
            <Text variant="caption" color="muted" numberOfLines={2} style={styles.caption}>
              {post.caption}
            </Text>
          )
        ) : null}

        <View style={[styles.row, styles.actions]}>
          <Pressable
            onPress={onLikePress}
            accessibilityRole="button"
            accessibilityLabel="Like"
            accessibilityState={{ selected: liked }}
            style={[styles.row, styles.action, { minHeight: theme.minTouchTarget }]}
          >
            <Icon
              name="heart"
              size={21}
              color={liked ? 'danger' : 'ink'}
              fill={liked ? 'danger' : undefined}
            />
            <Text
              variant="caption"
              color={liked ? 'danger' : 'ink'}
              style={{ fontFamily: theme.fontFamily.bodySemiBold }}
            >
              {post.likes_count}
            </Text>
          </Pressable>

          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="Comments"
            style={[styles.row, styles.action, { minHeight: theme.minTouchTarget }]}
          >
            <Icon name="comment" size={21} />
            <Text variant="caption" style={{ fontFamily: theme.fontFamily.bodySemiBold }}>
              {post.comments_count}
            </Text>
          </Pressable>
        </View>
      </View>
    </Card>
  )
}

export default React.memo(PostCard)

const styles = StyleSheet.create({
  card: { marginBottom: 0 },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  body: { paddingTop: 4, paddingHorizontal: 15, paddingBottom: 2 },
  identity: { flex: 1, gap: 9 },
  // `flex: 1`, not `flexShrink: 1`: a shrink-wrapped one-line name is measured
  // narrower than Android then draws it in Inter SemiBold, so "Card162Tester"
  // ellipsised at "Card162Tes…" with the whole row empty beside it (seen on
  // the Pixel10 under STOURIFY-260). Filling the row leaves nothing to misjudge.
  name: { flex: 1 },
  pillOnPhoto: { position: 'absolute', top: 12, left: 12, right: 12, alignItems: 'flex-start' },
  pillInBody: { alignItems: 'flex-start', marginBottom: 8 },
  spotPill: {
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 20,
    maxWidth: '100%',
  },
  spotPillText: { fontSize: 12, lineHeight: 16, flexShrink: 1 },
  tags: { gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  caption: { lineHeight: 19 },
  actions: { gap: 18 },
  action: { gap: 6 },
})

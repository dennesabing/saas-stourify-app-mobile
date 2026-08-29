export interface User {
  id: string
  uuid: string
  name: string
  email: string
  bio?: string
  avatar?: string
}

/**
 * A media entry from `SpotResource`/`PostResource`'s `media` array.
 *
 * `thumb_url` is a real 400x400 conversion. Both `Spot` and `Post` register it
 * (`registerMediaConversions()` in each model), so prefer it anywhere the
 * picture is drawn smaller than that — `url` is the untouched upload and is
 * often several megabytes.
 *
 * This comment used to say the opposite: that no conversion existed, that the
 * field was always null, and that callers should render `url` and scale it
 * client-side. That was true when it was written and stopped being true when
 * the conversions landed, and a stale instruction in a type is worse than no
 * instruction — the explore grid was built against it and would have shipped
 * downloading originals into 170-point cells (STOURIFY-53).
 *
 * It can still be `null` for one reason: a photo whose conversion has not
 * finished yet. That is a *not ready* answer, never a *use the original*
 * answer — see `thumbFor()` in `src/features/discover/api/exploreSpots.ts`.
 */
/**
 * Where a spot sits in its life, from written-but-hidden to taken down.
 *
 * These four names are `Modules\Stourify\Enums\SpotStatus`, and the model casts
 * the column to that enum, so a spot can never hold anything else. All four
 * genuinely reach a phone: `/spots` hands an author their own spots in whatever
 * state — the offline flow writes a `draft` locally and publishes it on
 * reconnect — and a moderator sees everything, `under_review` and `removed`
 * included. Only `published` is discoverable to everyone else.
 *
 * This used to read `'active' | 'pending'`, which is `Follow.status` further
 * down this file, copied onto a field that shares nothing with it but a name
 * (STOURIFY-72). The server has never sent either value, so the detail screen's
 * `status === 'active'` check could not be true and its "✓ Verified" tag never
 * rendered on any spot on any device. Do not restore those two from an old
 * branch; `Follow.status` is where they belong and it is correct there.
 */
export type SpotStatus = 'draft' | 'published' | 'under_review' | 'removed'

export interface SpotMedia {
  uuid: string
  url: string
  thumb_url: string | null
}

/**
 * Mirrors the subset of `SpotResource::toArray()` that the app actually reads.
 *
 * **No numeric id, ever — join on `uuid`.** `SpotResource` sends `uuid` and no
 * `id`, and that is a decision rather than an oversight: the offline sync delta
 * (`SyncSerializer::COLUMNS['sto_spots']`) is a second wire format for the same
 * table and it *does* send the integer, which the local database keeps in its
 * `server_id` column. So the public surface exposes the uuid and the private
 * delta exposes both.
 *
 * A required `id: string` used to sit at the top of this interface anyway
 * (STOURIFY-27). Nothing read it, so it cost nothing at run time — it cost
 * fixture honesty, because every `Spot` fixture had to invent a value or reach
 * for an `as Spot` cast, and a cast silences every future complaint as well as
 * the one it was aimed at. That is exactly how `name` survived to STOURIFY-11.
 */
export interface Spot {
  uuid: string
  /**
   * A spot's name. `SpotResource::toArray()` sends this and only this — there
   * has never been a `name` key on the wire.
   *
   * `name` used to sit above this as a REQUIRED field, with `title` optional:
   * exactly backwards. A required field the server never sends types
   * `undefined` as a `string`, so `PostCard`, `PostComposeScreen` and
   * `SpotPickerScreen` all rendered blanks with a clean typecheck. Removed
   * rather than deprecated (STOURIFY-11) — an optional `name` would keep the
   * same reads compiling.
   */
  title: string
  slug: string
  description?: string
  /**
   * Where the spot is — **optional, because the server withholds it**.
   *
   * A contributor can turn off `shows_location_on_spots`, and since
   * STOURIFY-185 `SpotResource` then omits `latitude` and `longitude`
   * entirely for everybody except that contributor and a moderator. Omitted,
   * not nulled: the decision on STOURIFY-75 was that a client must be able to
   * TELL the position is unavailable, because a rounded or invented
   * coordinate renders as a pin somewhere plausible and wrong.
   *
   * So every reader needs a branch. Declaring these required was the same
   * defect as `name` (STOURIFY-11) and `id` (STOURIFY-27) — a required field
   * the server does not always send types `undefined` as a `number`, and the
   * typecheck stays green while a screen draws a pin at `(undefined,
   * undefined)`.
   *
   * Check with `typeof === 'number'`, never truthiness: latitude 0 is the
   * equator and longitude 0 is Greenwich, and both are real places
   * (STOURIFY-65).
   */
  latitude?: number
  longitude?: number
  address?: string
  status: SpotStatus
  /**
   * Whether a moderator has vouched for this spot — the "✓ Verified" tag on
   * the detail screen, and nothing else reads it.
   *
   * Required, because the server always sends it: `SpotResource::toArray()`
   * writes the key unconditionally and the column is `NOT NULL DEFAULT false`,
   * so there is no response in which a `Spot` arrives without one. Nobody using
   * the app can set it — `SpotUpdateRequest` leaves it out on purpose, and the
   * offline push (`SyncController::pushSpot()`) validates against those same
   * rules, so it is dropped there too. Today only a moderator's own action or
   * the demo seeder turns it on.
   */
  is_verified: boolean
  /**
   * `SpotResource::toArray()`'s real field — a flat array of category names.
   *
   * There is no singular `category` object to go with it. One was declared here
   * as a "legacy alias" and the server never sent it in any shape (STOURIFY-27);
   * do not re-add it from an old screenshot or an old branch.
   */
  categories?: string[]
  /** Always an array, never null — an unattached spot still returns `[]`. */
  media?: SpotMedia[]
  rating_average?: number
  reviews_count?: number
  saves_count?: number
  /**
   * How far this spot is from the position that was queried, in kilometres.
   *
   * Present ONLY on `GET /spots/nearby` — `SpotResource` merges the key in when
   * the controller has computed it and omits it entirely otherwise, so a client
   * can tell "not applicable" from "zero". Never treat a missing value as 0.
   */
  distance_km?: number
}

/** Mirrors `ReviewResource::toArray()`'s nested `author` — present on index/show only. */
export interface ReviewAuthor {
  uuid: string
  name: string
  username: string | null
  avatar_url: string | null
}

/**
 * Mirrors `Modules\Stourify\Http\Resources\ReviewResource::toArray()`.
 * `author` is present on index/show; on store/update responses `author.username`
 * is `null` even when a profile exists (a known, documented backend
 * inconsistency) — do not depend on it from a write response.
 */
export interface Review {
  uuid: string
  rating: number
  body: string | null
  helpful_count: number
  marked_helpful?: boolean
  spot_uuid?: string
  author_uuid?: string
  author?: ReviewAuthor
  created_at: string
  updated_at: string
  can: Record<string, boolean>
}

/**
 * The identity `PostResource` nests under `author`, `whenLoaded('user')`.
 * Absent (not just falsy) on paths that never loaded the relation — a post
 * row must render without crashing when this is missing.
 */
export interface PostAuthor {
  uuid: string
  name: string
  username: string | null
  avatar_url: string | null
}

/**
 * Mirrors `Modules\Stourify\Http\Resources\PostResource::toArray()` exactly.
 * There is no `id` (only `uuid`) and no `media` key — the server has never
 * sent either.
 */
export interface Post {
  uuid: string
  caption?: string
  visibility: 'public' | 'followers' | 'private'
  is_published: boolean
  published_at: string | null
  likes_count: number
  comments_count: number
  /**
   * Present only when the viewer's reaction was eager-loaded — absent means
   * "not evaluated", not "not liked". See `PostResource::toArray()`.
   */
  is_liked?: boolean
  spot?: Spot
  author_uuid?: string
  author?: PostAuthor
  /** Always an array, never null — mirrors `PostResource::toArray()`'s `media` key (M3c Task 1). */
  media?: SpotMedia[]
  /**
   * The hashtags the server parsed out of the caption, present only when the
   * relation was eager-loaded (STOURIFY-171).
   *
   * **The app does not render from this**, and that is deliberate: a post
   * waiting in the send-later queue has never reached the server and has no
   * such array, so its hashtags would be invisible at the moment somebody is
   * most likely to be looking at it. `HashtagText` reads the caption instead.
   * This is here because the field is on the wire and typing it is honest.
   */
  tags?: Tag[]
  created_at: string
  updated_at: string
  can: Record<string, boolean>
}

export interface CommentAuthor {
  id: string
  name: string
}

/** Mirrors `App\Http\Resources\CommentResource::toArray()` exactly. */
export interface Comment {
  id: string
  body: string
  visibility_type: string
  user?: CommentAuthor
  commentable_type: string
  commentable_id: number
  parent_id: string | null
  replies: Comment[]
  created_at: string
  updated_at: string
  can: Record<string, boolean>
}

/**
 * The identity `SpotAboutResource` nests under `author`, `whenLoaded('user')`.
 * Absent — not merely falsy — on any path that did not load the relation.
 */
export interface SpotAboutAuthor {
  uuid: string
  name: string
  username: string | null
  avatar_url: string | null
}

/**
 * One note a visitor pinned up about a spot.
 *
 * Mirrors `Modules\Stourify\Http\Resources\SpotAboutResource::toArray()`
 * exactly. Three fields are **optional on purpose**, and the reason is the same
 * for all three: the server omits a field it did not evaluate, rather than
 * sending a zero or a `false` that reads as an answer.
 *
 * A blank form and a form filled in with "no" are different documents, and a
 * client that flattens them draws a hollow heart on a record whose likes were
 * never looked up. `is_liked !== true` renders the same hollow heart while
 * keeping the difference readable in the type.
 */
export interface SpotAbout {
  uuid: string
  body: string
  /** Present when the `spot` relation was loaded — every read path loads it. */
  spot_uuid?: string
  author?: SpotAboutAuthor
  /** A stored column on the server, kept correct by its reaction observer. */
  likes_count: number
  /** Absent means "not counted", never "nobody replied". */
  comments_count?: number
  /** Absent means "the viewer's own reaction was not looked up", never "not liked". */
  is_liked?: boolean
  created_at: string
  updated_at: string
  can: Record<string, boolean>
}

export interface Follow {
  id: string
  uuid: string
  status: 'active' | 'pending'
  follower?: User
  followee?: User
  created_at: string
}

export interface PaginatedResponse<T> {
  data: T[]
  links: { next?: string; prev?: string }
  meta: { current_page: number; last_page: number; total: number }
}

export interface CursorPaginatedResponse<T> {
  data: T[]
  next_cursor: string | null
  prev_cursor: string | null
}

export interface ApiError {
  message: string
  errors?: Record<string, string[]>
  status?: number
}

/**
 * A search hit from `GET /discover/search?type=people` — the profile-sourced
 * card `PersonResource` returns. No follower counts (a search fan-out the
 * server does not pay) and no email, ever.
 */
export interface Person {
  uuid: string
  user_uuid: string | null
  username: string
  name: string | null
  bio: string | null
  is_private: boolean
}

/**
 * A search hit from `GET /discover/search?type=cities` — mirrors
 * `CityResource::toArray()`. Cities are curated reference data, so the shape is
 * deliberately thin: enough to label and group a spot, and nothing else.
 */
export interface City {
  uuid: string
  name: string
  region: string | null
  country: string | null
  is_featured: boolean
}

/**
 * A hashtag somebody typed, as `TagResource` sends it.
 *
 * `slug` is the matching form and the thing to put in a request; `name` is the
 * spelling of whoever wrote the word first, which is why a tag page can read
 * `#StreetFood` rather than shouting the lowercased version at everybody.
 *
 * There is deliberately no count — see `TagResource` for why (STOURIFY-172).
 */
export interface Tag {
  uuid: string
  slug: string
  name: string
}

/**
 * The result types this app asks discover search for.
 *
 * **Narrower than the server's list on purpose.** `SearchRequest::TYPES` gained
 * `tags` in STOURIFY-172 — it used to answer `422`, because there was no
 * hashtag vocabulary to search until STOURIFY-171 created one, which was the
 * open question on STOURIFY-25. This app does not offer that tab yet: a hashtag
 * is reached by tapping one in a caption (STOURIFY-173), and a Tags rail on the
 * Search screen is a separate piece of work.
 *
 * Widening this union without adding the tab would make `groupOneType` in
 * `SearchScreen` silently return three empty sections for a `tags` search — a
 * type that compiles and a screen that lies.
 */
export type DiscoverSearchType = 'spots' | 'cities' | 'people'

/**
 * The grouped preview an UNTYPED `GET /discover/search` returns — the "All"
 * view. Each section is capped server-side (`SearchApiController::PREVIEW_LIMIT`),
 * so this is a preview and never a page: to paginate one type, send `type`.
 */
export interface DiscoverSearchResults {
  spots: Spot[]
  cities: City[]
  people: Person[]
}

/**
 * Mirrors `App\Http\Resources\MediaResource::toArray()` — the shape
 * `POST /media/attach` returns as its `data`.
 */
export interface Media {
  id: number
  uuid: string
  name: string
  file_name: string
  mime_type: string
  size: number
  url: string
  thumb_url: string | null
  collection_name: string
  created_at: string | null
  can: Record<string, boolean>
}

export interface AuthConfig {
  invitation_only: boolean
  registration_enabled: boolean
}

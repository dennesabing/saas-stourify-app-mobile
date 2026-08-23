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
export interface SpotMedia {
  uuid: string
  url: string
  thumb_url: string | null
}

export interface Spot {
  id: string
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
   *
   * No numeric id, ever — join on `uuid`.
   */
  title: string
  slug: string
  description?: string
  latitude: number
  longitude: number
  address?: string
  status: 'active' | 'pending'
  /** Legacy alias — the server has never actually sent a singular `category` object. */
  category?: { id: string; name: string; slug: string }
  /** `SpotResource::toArray()`'s real field — a flat array of category names. */
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

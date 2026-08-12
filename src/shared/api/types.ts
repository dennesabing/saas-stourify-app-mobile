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

export interface Follow {
  id: string
  uuid: string
  status: 'active' | 'pending'
  follower?: User
  followee?: User
  created_at: string
}

export interface AccountSettings {
  account_visibility: 'public' | 'followers_only' | 'private'
  follow_mode: 'open' | 'approval_required'
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

/** The result types `SearchRequest::TYPES` accepts. `tags` is NOT one — see STOURIFY-25. */
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

export interface User {
  id: string
  uuid: string
  name: string
  email: string
  bio?: string
  avatar?: string
}

export interface Spot {
  id: string
  uuid: string
  name: string
  slug: string
  description?: string
  latitude: number
  longitude: number
  address?: string
  status: 'active' | 'pending'
  category?: { id: string; name: string; slug: string }
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

export interface AuthConfig {
  invitation_only: boolean
  registration_enabled: boolean
}

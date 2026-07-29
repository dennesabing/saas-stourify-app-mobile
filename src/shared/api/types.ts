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

export interface PostMedia {
  id: string
  url: string
  type: 'photo' | 'video'
  order: number
  duration?: number
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

export interface Post {
  id: string
  uuid: string
  caption?: string
  visibility: 'public' | 'followers' | 'private'
  likes_count: number
  comments_count: number
  /**
   * Present only when the viewer's reaction was eager-loaded — absent means
   * "not evaluated", not "not liked". See `PostResource::toArray()`.
   */
  is_liked?: boolean
  /** @deprecated legacy field, no longer sent by `PostResource` — kept so unmigrated screens still typecheck. */
  user?: User
  author?: PostAuthor
  author_uuid?: string
  spot?: Spot
  /** @deprecated legacy field, `PostResource` has no media key — kept so unmigrated screens still typecheck. */
  media?: PostMedia[]
  created_at: string
}

export interface CommentAuthor {
  id: string
  name: string
}

export interface Comment {
  id: string
  body: string
  user?: CommentAuthor
  parent_id?: string | null
  created_at: string
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

export interface AuthConfig {
  invitation_only: boolean
  registration_enabled: boolean
}

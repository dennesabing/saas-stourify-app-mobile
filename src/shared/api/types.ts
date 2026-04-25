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

export interface Post {
  id: string
  uuid: string
  caption?: string
  visibility: 'public' | 'followers' | 'private'
  likes_count: number
  comments_count: number
  user?: User
  spot?: Spot
  media?: PostMedia[]
  created_at: string
}

export interface Comment {
  id: string
  body: string
  user?: User
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

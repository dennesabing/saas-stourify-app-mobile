import { Model } from '@nozbe/watermelondb'

/** One chosen photo, in the shape the compose route already speaks. */
export interface DraftMedia {
  uri: string
  type?: string
  fileName?: string
}

/**
 * A post somebody started writing and has not shared (STOURIFY-159).
 *
 * Local only — never pushed, never pulled, not in `SYNCED_TABLES`. The server
 * has no idea this row exists, which is exactly what makes drafting work with
 * no signal at all.
 *
 * The row is deleted when the post is successfully shared, or when the author
 * throws it away from the Drafts page. Nothing else ever deletes one: there is
 * no expiry, on purpose (see STOURIFY-104's assumption notes).
 */
export default class PostDraft extends Model {
  static table = 'post_drafts'

  /** What the author has written so far. Empty is normal, not an error. */
  get caption(): string {
    return this._getRaw('caption') as string
  }

  /** `public` | `followers` | `private` — whatever the picker was left on. */
  get visibility(): string {
    return this._getRaw('visibility') as string
  }

  /** The tagged spot, if the author tagged one. */
  get spotUuid(): string | null {
    return (this._getRaw('spot_uuid') as string | null) ?? null
  }

  /**
   * The tagged spot's name, copied at save time.
   *
   * Duplicated data that can go stale if the spot is renamed. Accepted: the
   * Drafts page must be able to name the spot with no network, and the spot
   * may not be in the local database at all.
   */
  get spotTitle(): string | null {
    return (this._getRaw('spot_title') as string | null) ?? null
  }

  /**
   * The chosen photos.
   *
   * Stored as JSON text, so a malformed value would throw while rendering a
   * list. It answers with an empty list instead: a draft whose photos cannot
   * be read is still a draft whose words are worth showing.
   */
  get media(): DraftMedia[] {
    const raw = this._getRaw('media') as string
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as DraftMedia[]) : []
    } catch {
      return []
    }
  }

  get createdAt(): number {
    return this._getRaw('created_at') as number
  }

  /** Last touched — what the Drafts page sorts by. */
  get updatedAt(): number {
    return this._getRaw('updated_at') as number
  }
}

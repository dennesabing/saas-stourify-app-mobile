import { Model } from '@nozbe/watermelondb'
import type { DraftMedia } from './PostDraft'

/**
 * A post somebody pressed **Share** on while there was no signal
 * (STOURIFY-161).
 *
 * Local only — never pushed, never pulled, not in `SYNCED_TABLES`. The server
 * has never heard of this table, which is what makes it possible to accept a
 * post with the radio switched off.
 *
 * Think of a postbox rather than a filing cabinet. Nothing is meant to live
 * here: `sync/postOutboxDrain.ts` empties it on every sync cycle, and a row is
 * deleted the moment its post is actually published.
 */
export default class PostOutbox extends Model {
  static table = 'post_outbox'

  /** The words, as the author left them. Empty is normal. */
  get caption(): string {
    return this._getRaw('caption') as string
  }

  /** `public` | `followers` | `private` — the audience the author chose. */
  get visibility(): string {
    return this._getRaw('visibility') as string
  }

  get spotUuid(): string | null {
    return (this._getRaw('spot_uuid') as string | null) ?? null
  }

  /**
   * The tagged spot's name, carried over from the draft.
   *
   * Duplicated data, for the same reason a draft duplicates it: the queue
   * screen has to be able to name the spot with no network, which is the only
   * situation this row exists in.
   */
  get spotTitle(): string | null {
    return (this._getRaw('spot_title') as string | null) ?? null
  }

  /**
   * The photos, pointing at app-private copies — the same files the draft
   * held, inherited rather than copied again.
   *
   * Stored as JSON text, and a malformed value answers with an empty list
   * rather than throwing: a queue entry whose photo list cannot be read is
   * still a post whose words are worth sending.
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

  /**
   * The server's id for this post, once `POST /posts` has answered.
   *
   * `null` means the server has never heard of it. Anything else means the
   * post already exists there, unpublished, and the next attempt must carry on
   * from that rather than create a second one.
   */
  get postUuid(): string | null {
    return (this._getRaw('post_uuid') as string | null) ?? null
  }

  /**
   * `queued` — waiting for a signal, and the drain will try it.
   * `failed` — the server refused it; only a person pressing Retry moves it back.
   */
  get state(): string {
    return this._getRaw('state') as string
  }

  get attempts(): number {
    return this._getRaw('attempts') as number
  }

  get lastError(): string | null {
    return (this._getRaw('last_error') as string | null) ?? null
  }

  get createdAt(): number {
    return this._getRaw('created_at') as number
  }
}

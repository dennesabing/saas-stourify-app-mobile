import { Model } from '@nozbe/watermelondb'

/**
 * Local only — never pushed, never pulled, not in `SYNCED_TABLES`.
 *
 * The offline media outbox. A row is written by `queueLocalMedia()` at
 * capture time, pointing at a copy of the bytes in app-private storage
 * (never the picker/camera URI). Phase 2 of the drain (Task 5) presigns,
 * PUTs and attaches each row once its host record has been acked by the
 * server, then deletes both the file and the row.
 */
export default class PendingMedia extends Model {
  static table = 'pending_media'

  /** Morph alias (e.g. `stourify_spot`), not FQCN — matches `AllowedMorph` server-side. */
  get hostType(): string {
    return this._getRaw('host_type') as string
  }

  /** The host row's uuid; `attach` resolves the host by it. */
  get hostUuid(): string {
    return this._getRaw('host_uuid') as string
  }

  /** App-private copy of the bytes, written by `queueLocalMedia()`. */
  get localPath(): string {
    return this._getRaw('local_path') as string
  }

  /** Sent as `filename` to `POST /media/upload-url`. */
  get filename(): string {
    return this._getRaw('filename') as string
  }

  /** Sent as `content_type` to `POST /media/upload-url`. */
  get mime(): string {
    return this._getRaw('mime') as string
  }

  /** Advisory only — the server enforces its own ceiling at attach, not at presign. */
  get size(): number {
    return this._getRaw('size') as number
  }

  /** 'pending' | 'uploading' | 'failed' */
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

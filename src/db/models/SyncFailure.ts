import { Model } from '@nozbe/watermelondb'

/**
 * Local only — never pushed, never pulled, not in `SYNCED_TABLES`.
 *
 * WatermelonDB's own `_status`/`_changed` dirty tracking IS the outbox, so this
 * table carries only what that tracking lacks: why a row was rejected, how many
 * times, and when.
 */
export default class SyncFailure extends Model {
  static table = 'sync_failures'

  /** The local record id (== the row's uuid) of the record that failed. */
  get recordId(): string {
    return this._getRaw('record_id') as string
  }

  get tableName(): string {
    return this._getRaw('table_name') as string
  }

  /** 'validation' | 'forbidden' | 'error' — anything else the server sends is treated as 'error'. */
  get reason(): string {
    return this._getRaw('reason') as string
  }

  get attempts(): number {
    return this._getRaw('attempts') as number
  }

  get lastError(): string {
    return this._getRaw('last_error') as string
  }

  get failedAt(): number {
    return this._getRaw('failed_at') as number
  }

  /**
   * A validation or forbidden rejection is excluded from the next drain until
   * the user edits the row or explicitly retries. Without this exclusion a
   * permanently-invalid row re-pushes every cycle, forever — and because the
   * skip-pull gate blocks the pull on any un-acked row, it would also stall all
   * incoming data indefinitely.
   */
  get blocksDrain(): boolean {
    return this.reason === 'validation' || this.reason === 'forbidden'
  }
}

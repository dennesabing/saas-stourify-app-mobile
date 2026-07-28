import { Model } from '@nozbe/watermelondb'
import type { SyncStatus } from '@nozbe/watermelondb/Model'

export default class Follow extends Model {
  static table = 'sto_follows'

  get uuid(): string {
    return this._getRaw('uuid') as string
  }

  get serverId(): number | null {
    return this._getRaw('server_id') as number | null
  }

  get followerId(): number | null {
    return this._getRaw('follower_id') as number | null
  }

  get followeeId(): number | null {
    return this._getRaw('followee_id') as number | null
  }

  /** Local-only: the followee's user uuid, which the push envelope sends as `user_uuid`. */
  get followeeUuid(): string | null {
    return this._getRaw('followee_uuid') as string | null
  }

  get status(): string {
    return this._getRaw('status') as string
  }

  get isQueued(): boolean {
    return this.syncStatus !== 'synced'
  }

  get syncStatus(): SyncStatus {
    return (this._raw as Record<string, unknown>)._status as SyncStatus
  }
}

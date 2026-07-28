import { Model, Q } from '@nozbe/watermelondb'
import type { Query } from '@nozbe/watermelondb'
import type { SyncStatus } from '@nozbe/watermelondb/Model'
import type Spot from './Spot'

export default class Review extends Model {
  static table = 'sto_reviews'

  get uuid(): string {
    return this._getRaw('uuid') as string
  }

  get serverId(): number | null {
    return this._getRaw('server_id') as number | null
  }

  get userId(): number | null {
    return this._getRaw('user_id') as number | null
  }

  get spotId(): number | null {
    return this._getRaw('spot_id') as number | null
  }

  get spotUuid(): string | null {
    return this._getRaw('spot_uuid') as string | null
  }

  get rating(): number {
    return this._getRaw('rating') as number
  }

  get body(): string | null {
    return this._getRaw('body') as string | null
  }

  get helpfulCount(): number {
    return this._getRaw('helpful_count') as number
  }

  get isQueued(): boolean {
    return this.syncStatus !== 'synced'
  }

  get syncStatus(): SyncStatus {
    return (this._raw as Record<string, unknown>)._status as SyncStatus
  }

  get spot(): Query<Spot> {
    return this.collections.get<Spot>('sto_spots').query(Q.where('server_id', this.spotId ?? -1))
  }
}

import { Model, Q } from '@nozbe/watermelondb'
import type { Query } from '@nozbe/watermelondb'
import type { SyncStatus } from '@nozbe/watermelondb/Model'
import type Spot from './Spot'

export default class WishlistItem extends Model {
  static table = 'sto_wishlist_items'

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

  get cityId(): number | null {
    return this._getRaw('city_id') as number | null
  }

  get note(): string | null {
    return this._getRaw('note') as string | null
  }

  get isDownloadedOffline(): boolean {
    return this._getRaw('is_downloaded_offline') as boolean
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

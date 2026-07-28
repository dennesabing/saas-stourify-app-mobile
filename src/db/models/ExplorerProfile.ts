import { Model } from '@nozbe/watermelondb'
import type { SyncStatus } from '@nozbe/watermelondb/Model'
import { parseJsonArray } from './Spot'

export default class ExplorerProfile extends Model {
  static table = 'sto_explorer_profiles'

  get uuid(): string {
    return this._getRaw('uuid') as string
  }

  get serverId(): number | null {
    return this._getRaw('server_id') as number | null
  }

  get userId(): number | null {
    return this._getRaw('user_id') as number | null
  }

  get homeCityId(): number | null {
    return this._getRaw('home_city_id') as number | null
  }

  get username(): string {
    return this._getRaw('username') as string
  }

  get bio(): string | null {
    return this._getRaw('bio') as string | null
  }

  get website(): string | null {
    return this._getRaw('website') as string | null
  }

  get interests(): string[] {
    return parseJsonArray(this._getRaw('interests') as string | null)
  }

  get isPrivate(): boolean {
    return this._getRaw('is_private') as boolean
  }

  get showsLocationOnSpots(): boolean {
    return this._getRaw('shows_location_on_spots') as boolean
  }

  get isQueued(): boolean {
    return this.syncStatus !== 'synced'
  }

  get syncStatus(): SyncStatus {
    return (this._raw as Record<string, unknown>)._status as SyncStatus
  }
}

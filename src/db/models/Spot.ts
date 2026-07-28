import { Model, Q } from '@nozbe/watermelondb'
import type { Query } from '@nozbe/watermelondb'
import type { SyncStatus } from '@nozbe/watermelondb/Model'
import type City from './City'

/**
 * A spot in the local database.
 *
 * Written without decorators on purpose: `@field`/`@json` need
 * `@babel/plugin-proposal-decorators` in legacy mode, and changing a working
 * Expo babel config for syntax sugar is a bad trade. `_getRaw`/`_setRaw` are
 * exactly what the decorators call anyway.
 */
export default class Spot extends Model {
  static table = 'sto_spots'

  get uuid(): string {
    return this._getRaw('uuid') as string
  }

  get serverId(): number | null {
    return this._getRaw('server_id') as number | null
  }

  get userId(): number | null {
    return this._getRaw('user_id') as number | null
  }

  get cityId(): number | null {
    return this._getRaw('city_id') as number | null
  }

  get cityUuid(): string | null {
    return this._getRaw('city_uuid') as string | null
  }

  get title(): string {
    return this._getRaw('title') as string
  }

  get slug(): string | null {
    return this._getRaw('slug') as string | null
  }

  get description(): string | null {
    return this._getRaw('description') as string | null
  }

  get latitude(): number {
    return this._getRaw('latitude') as number
  }

  get longitude(): number {
    return this._getRaw('longitude') as number
  }

  get address(): string | null {
    return this._getRaw('address') as string | null
  }

  get categories(): string[] {
    return parseJsonArray(this._getRaw('categories') as string | null)
  }

  get hours(): Record<string, unknown> | null {
    const raw = this._getRaw('hours') as string | null
    if (raw === null || raw === '') return null
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return null
    }
  }

  get status(): string {
    return this._getRaw('status') as string
  }

  get ratingAverage(): number | null {
    return this._getRaw('rating_average') as number | null
  }

  get reviewsCount(): number {
    return this._getRaw('reviews_count') as number
  }

  /** Written locally and not yet acknowledged by the server. Drives `SpotCard.isQueued`. */
  get isQueued(): boolean {
    return this.syncStatus !== 'synced'
  }

  get syncStatus(): SyncStatus {
    return (this._raw as Record<string, unknown>)._status as SyncStatus
  }

  /**
   * The city, resolved by the SERVER's numeric id — not a WatermelonDB
   * `@relation`, which assumes the FK holds a local record id. It does not.
   */
  get city(): Query<City> {
    return this.collections
      .get<City>('sto_cities')
      .query(Q.where('server_id', this.cityId ?? -1))
  }
}

export function parseJsonArray(raw: string | null): string[] {
  if (raw === null || raw === '') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

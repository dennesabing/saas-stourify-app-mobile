import { Model, Q } from '@nozbe/watermelondb'
import type { Query } from '@nozbe/watermelondb'
import type { SyncStatus } from '@nozbe/watermelondb/Model'
import type Spot from './Spot'

/**
 * What a save keeps of its spot, for the Saved list to draw before the sync
 * has sent it (STOURIFY-207). The fields the Saved row draws, and no more: a
 * copy is a second place a fact lives, so it holds only what it has to.
 */
export interface SpotSnapshot {
  uuid: string
  title: string
  categories: string[]
  address: string | null
  thumb_url: string | null
}

/**
 * Reads the stored copy back, or `null` when there is none or it cannot be
 * read. A save whose copy is damaged is still a save; the list falls back to
 * a plain row for it rather than failing to draw.
 */
function parseSpotSnapshot(raw: unknown): SpotSnapshot | null {
  if (typeof raw !== 'string' || raw === '') return null

  try {
    const value = JSON.parse(raw) as Partial<SpotSnapshot> | null
    if (!value || typeof value.uuid !== 'string' || typeof value.title !== 'string') return null

    return {
      uuid: value.uuid,
      title: value.title,
      categories: Array.isArray(value.categories) ? value.categories : [],
      address: typeof value.address === 'string' ? value.address : null,
      thumb_url: typeof value.thumb_url === 'string' ? value.thumb_url : null,
    }
  } catch {
    return null
  }
}

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

  /** The copy of the spot kept at save time — see `schema.ts`. */
  get spotSnapshot(): SpotSnapshot | null {
    return parseSpotSnapshot(this._getRaw('spot_snapshot'))
  }

  get createdAt(): number {
    return this._getRaw('created_at') as number
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

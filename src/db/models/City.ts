import { Model } from '@nozbe/watermelondb'

export default class City extends Model {
  static table = 'sto_cities'

  get uuid(): string {
    return this._getRaw('uuid') as string
  }

  get serverId(): number | null {
    return this._getRaw('server_id') as number | null
  }

  get name(): string {
    return this._getRaw('name') as string
  }

  get slug(): string {
    return this._getRaw('slug') as string
  }

  get region(): string | null {
    return this._getRaw('region') as string | null
  }

  get country(): string | null {
    return this._getRaw('country') as string | null
  }

  /**
   * Both optional, and the pair is only meaningful together — a city with a
   * latitude and no longitude cannot be pointed at, so callers check both.
   */
  get latitude(): number | null {
    return this._getRaw('latitude') as number | null
  }

  get longitude(): number | null {
    return this._getRaw('longitude') as number | null
  }

  get isFeatured(): boolean {
    return this._getRaw('is_featured') as boolean
  }
}

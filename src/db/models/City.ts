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

  get isFeatured(): boolean {
    return this._getRaw('is_featured') as boolean
  }
}

import { Q, type Database } from '@nozbe/watermelondb'
import type City from '@/db/models/City'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import type { MapCoordinate } from './types'

/**
 * Where to point the map when the device will not say where the phone is.
 *
 * Think of handing someone a paper map with no "you are here" arrow: it is far
 * more use opened at their own city than at the middle of the country. The
 * explorer's home city is the closest thing the app already knows, and it is
 * already in the local database — so this works with the radio off, which is
 * the situation it exists for.
 *
 * General Santos City is the last resort. It is where Stourify's first spots
 * are, and the same coordinates the repo's emulator testing doc injects, so a
 * developer with no profile sees a map of somewhere with content on it.
 *
 * This lives in the map seam rather than in the feature that first needed it:
 * the spot-creation picker and the Discover map both open on it, and a feature
 * reaching into another feature's folder is the sideways dependency this
 * codebase does not allow (root `CLAUDE.md` → *Dependency Direction*).
 */
export const DEFAULT_MAP_CENTER: MapCoordinate = { latitude: 6.1164, longitude: 125.1716 }

/**
 * The home city's coordinates if they can be resolved, else
 * `DEFAULT_MAP_CENTER`. Never throws and never rejects: a picker that cannot
 * open because a lookup failed is worse than a picker opened in the wrong city.
 */
export async function readFallbackCenter(database: Database): Promise<MapCoordinate> {
  try {
    const profiles = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()
    const homeCityId = profiles[0]?.homeCityId ?? null

    if (homeCityId === null) return DEFAULT_MAP_CENTER

    // By `server_id`, not by record id: the local id of a synced row is the
    // server's uuid, so looking a city up by the numeric `home_city_id` finds
    // nothing and returns the default — which reads as working code. `Spot.city`
    // resolves the same relationship the same way.
    const cities = await database
      .get<City>('sto_cities')
      .query(Q.where('server_id', homeCityId))
      .fetch()

    const city = cities[0]
    if (!city) return DEFAULT_MAP_CENTER

    const { latitude, longitude } = city
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return DEFAULT_MAP_CENTER

    return { latitude, longitude }
  } catch {
    return DEFAULT_MAP_CENTER
  }
}

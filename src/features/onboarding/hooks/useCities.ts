import { useEffect, useState } from 'react'
import { useDatabase } from '@nozbe/watermelondb/react'
import type City from '@/db/models/City'

/** The shape `HomeCityScreen` renders — a snapshot, not a live model. */
export interface CityRow {
  id: string
  /**
   * The server's uuid for this city. `EditProfileScreen` needs it because
   * `PATCH /profile` addresses a home city by uuid, while the local write path
   * onboarding uses addresses it by the numeric `serverId` below.
   */
  uuid: string
  serverId: number | null
  name: string
  region: string | null
  country: string | null
  /** A city the team picked to show first — onboarding's "Suggested" list leads with these. */
  isFeatured: boolean
}

function toRow(row: City): CityRow {
  return {
    id: row.id,
    uuid: row.uuid,
    serverId: row.serverId,
    name: row.name,
    region: row.region,
    country: row.country,
    isFeatured: row.isFeatured === true,
  }
}

/**
 * Subscribes to the local `sto_cities` table — pull-only reference data
 * already synced by M2, never fetched over the network from this screen. An
 * empty result means the first delta has not landed yet, not that there are
 * no cities; the screen is the one that decides what to show for that.
 */
export function useCities(): CityRow[] {
  const database = useDatabase()
  const [cities, setCities] = useState<CityRow[]>([])

  useEffect(() => {
    let cancelled = false

    const query = database.get<City>('sto_cities').query()

    function load(): void {
      void query.fetch().then((rows) => {
        if (!cancelled) setCities(rows.map(toRow))
      })
    }

    const subscription = database.withChangesForTables(['sto_cities']).subscribe(load)

    load()

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [database])

  return cities
}

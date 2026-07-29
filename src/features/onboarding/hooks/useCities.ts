import { useEffect, useState } from 'react'
import { useDatabase } from '@nozbe/watermelondb/react'
import type City from '@/db/models/City'

/** The shape `HomeCityScreen` renders — a snapshot, not a live model. */
export interface CityRow {
  id: string
  serverId: number | null
  name: string
  region: string | null
  country: string | null
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

    const subscription = database.withChangesForTables(['sto_cities']).subscribe(() => {
      void query.fetch().then((rows) => {
        if (cancelled) return

        setCities(
          rows.map((row) => ({
            id: row.id,
            serverId: row.serverId,
            name: row.name,
            region: row.region,
            country: row.country,
          })),
        )
      })
    })

    void query.fetch().then((rows) => {
      if (cancelled) return

      setCities(
        rows.map((row) => ({
          id: row.id,
          serverId: row.serverId,
          name: row.name,
          region: row.region,
          country: row.country,
        })),
      )
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [database])

  return cities
}

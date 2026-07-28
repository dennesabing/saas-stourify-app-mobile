import { Database } from '@nozbe/watermelondb'
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs'
import { createDatabase, modelClasses, wipeDatabase } from '@/db'
import { stourifySchema } from '@/db/schema'
import City from '@/db/models/City'
import Spot from '@/db/models/Spot'

function freshDatabase(): Database {
  return createDatabase(
    new LokiJSAdapter({
      schema: stourifySchema,
      useWebWorker: false,
      useIncrementalIndexedDB: false,
      // LokiJS defaults to `autosave: true` with a 500ms `setInterval`. In a
      // throwaway in-memory test database there is nothing to persist, and the
      // timer keeps Node's event loop alive forever — jest hangs after the
      // suite finishes ("did not exit one second after the test run"). This is
      // the one deliberate deviation from the brief's test code: the brief's
      // literal `freshDatabase()` reproduces the hang, confirmed by isolating
      // `new LokiJSAdapter(...)` alone in its own test file with nothing else
      // imported.
      extraLokiOptions: { autosave: false },
    }),
  )
}

let database: Database

beforeEach(() => {
  database = freshDatabase()
})

it('registers one model class per table in the schema', () => {
  expect(modelClasses).toHaveLength(Object.keys(stourifySchema.tables).length)
})

it('exposes typed accessors over the raw row', async () => {
  const spot = await database.write(async () =>
    database.get<Spot>('sto_spots').create((row: any) => {
      row._raw.id = 'spot-uuid-1'
      row._raw.uuid = 'spot-uuid-1'
      row._raw.title = 'Hidden Cove'
      row._raw.latitude = 6.1164
      row._raw.longitude = 125.1716
      row._raw.status = 'draft'
      row._raw.is_verified = false
      row._raw.reviews_count = 0
      row._raw.saves_count = 0
      row._raw.categories = JSON.stringify(['beach', 'nature'])
      row._raw.created_at = 1_700_000_000_000
      row._raw.updated_at = 1_700_000_000_000
    }),
  )

  expect(spot.title).toBe('Hidden Cove')
  expect(spot.latitude).toBeCloseTo(6.1164)
  expect(spot.categories).toEqual(['beach', 'nature'])
  expect(spot.status).toBe('draft')
})

it('reports isQueued for a locally-created row and not for a synced one', async () => {
  const spot = await database.write(async () =>
    database.get<Spot>('sto_spots').create((row: any) => {
      row._raw.uuid = 'spot-uuid-2'
      row._raw.title = 'Queued Spot'
      row._raw.latitude = 1
      row._raw.longitude = 1
      row._raw.status = 'draft'
      row._raw.is_verified = false
      row._raw.reviews_count = 0
      row._raw.saves_count = 0
      row._raw.created_at = 1
      row._raw.updated_at = 1
    }),
  )

  expect(spot.isQueued).toBe(true)

  await database.write(async () => {
    await spot.update((row: any) => {
      row._raw._status = 'synced'
      row._raw._changed = ''
    })
  })

  expect(spot.isQueued).toBe(false)
})

it('resolves a numeric FK by server_id rather than by local record id', async () => {
  await database.write(async () => {
    await database.get<City>('sto_cities').create((row: any) => {
      row._raw.id = 'city-uuid-1'
      row._raw.uuid = 'city-uuid-1'
      row._raw.server_id = 7
      row._raw.name = 'General Santos'
      row._raw.slug = 'general-santos'
      row._raw.spot_count = 0
      row._raw.is_featured = false
      row._raw.created_at = 1
      row._raw.updated_at = 1
    })
    await database.get<Spot>('sto_spots').create((row: any) => {
      row._raw.id = 'spot-uuid-3'
      row._raw.uuid = 'spot-uuid-3'
      row._raw.city_id = 7
      row._raw.title = 'Kalaklan Point'
      row._raw.latitude = 1
      row._raw.longitude = 1
      row._raw.status = 'published'
      row._raw.is_verified = false
      row._raw.reviews_count = 0
      row._raw.saves_count = 0
      row._raw.created_at = 1
      row._raw.updated_at = 1
    })
  })

  const spot = await database.get<Spot>('sto_spots').find('spot-uuid-3')
  const cities = await spot.city.fetch()

  expect(cities).toHaveLength(1)
  expect(cities[0].name).toBe('General Santos')
})

it('wipeDatabase leaves no rows behind', async () => {
  await database.write(async () => {
    await database.get<City>('sto_cities').create((row: any) => {
      row._raw.uuid = 'city-uuid-2'
      row._raw.name = 'Davao'
      row._raw.slug = 'davao'
      row._raw.spot_count = 0
      row._raw.is_featured = false
      row._raw.created_at = 1
      row._raw.updated_at = 1
    })
  })

  await wipeDatabase(database)

  expect(await database.get<City>('sto_cities').query().fetchCount()).toBe(0)
})

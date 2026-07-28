import { Database } from '@nozbe/watermelondb'
import { modelClasses, wipeDatabase } from '@/db'
import { stourifySchema } from '@/db/schema'
import City from '@/db/models/City'
import Spot from '@/db/models/Spot'
import { createTestDatabase, seedCity, seedSpot, markSynced } from '../support/testDatabase'

let database: Database

beforeEach(() => {
  // `createTestDatabase()` (Task 5's harness) is the sole place a
  // `LokiJSAdapter` may be constructed — it is the only thing that sets
  // `extraLokiOptions: { autosave: false }`, which prevents LokiJS's default
  // 500ms autosave `setInterval` from keeping Node's event loop alive forever
  // (jest would otherwise hang after the suite finishes). Do not hand-roll a
  // local adapter here again.
  database = createTestDatabase()
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
  const spot = await seedSpot(database, { uuid: 'spot-uuid-2', title: 'Queued Spot' })

  expect(spot.isQueued).toBe(true)

  await markSynced(database, spot)

  expect(spot.isQueued).toBe(false)
})

it('resolves a numeric FK by server_id rather than by local record id', async () => {
  await seedCity(database, { uuid: 'city-uuid-1', serverId: 7, name: 'General Santos' })
  await seedSpot(database, {
    uuid: 'spot-uuid-3',
    cityId: 7,
    title: 'Kalaklan Point',
    status: 'published',
  })

  const spot = await database.get<Spot>('sto_spots').find('spot-uuid-3')
  const cities = await spot.city.fetch()

  expect(cities).toHaveLength(1)
  expect(cities[0].name).toBe('General Santos')
})

it('wipeDatabase leaves no rows behind', async () => {
  await seedCity(database, { uuid: 'city-uuid-2', name: 'Davao', slug: 'davao' })

  await wipeDatabase(database)

  expect(await database.get<City>('sto_cities').query().fetchCount()).toBe(0)
})

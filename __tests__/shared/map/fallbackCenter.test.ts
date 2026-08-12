import { DEFAULT_MAP_CENTER, readFallbackCenter } from '@/shared/map/fallbackCenter'
import { createTestDatabase, seedCity, seedExplorerProfile } from '../../support/testDatabase'

/**
 * Where a map points when the device will not say where the phone is.
 *
 * Every read here is local. That is the whole reason this lives in the database
 * rather than behind a request: the moment it is most needed — no permission, no
 * signal — is exactly the moment a lookup would fail.
 */

const GENSAN = { latitude: 6.1164, longitude: 125.1716 }

it('uses the home city on the explorer profile when it has coordinates', async () => {
  const database = createTestDatabase()
  await seedCity(database, { serverId: 7, name: 'Cebu', slug: 'cebu', latitude: 10.3157, longitude: 123.8854 })
  await seedExplorerProfile(database, { homeCityId: 7 })

  expect(await readFallbackCenter(database)).toEqual({ latitude: 10.3157, longitude: 123.8854 })
})

it('falls back to the documented default when there is no profile at all', async () => {
  const database = createTestDatabase()

  expect(await readFallbackCenter(database)).toEqual(DEFAULT_MAP_CENTER)
  expect(DEFAULT_MAP_CENTER).toEqual(GENSAN)
})

it('falls back when the profile names no home city', async () => {
  const database = createTestDatabase()
  await seedExplorerProfile(database, { homeCityId: null })

  expect(await readFallbackCenter(database)).toEqual(DEFAULT_MAP_CENTER)
})

// A city row is allowed to exist with no coordinates — both columns are
// optional server-side — so "the city is known" is not the same fact as "the
// city can be pointed at".
it('falls back when the home city row carries no coordinates', async () => {
  const database = createTestDatabase()
  await seedCity(database, { serverId: 7, latitude: null, longitude: null })
  await seedExplorerProfile(database, { homeCityId: 7 })

  expect(await readFallbackCenter(database)).toEqual(DEFAULT_MAP_CENTER)
})

// The city is looked up by the SERVER's numeric id, because the local record id
// is a uuid. A lookup written the obvious way finds nothing and silently
// returns the default, which looks like working code.
it('resolves the city by its server id, not by its local record id', async () => {
  const database = createTestDatabase()
  await seedCity(database, { uuid: 'a-uuid-that-is-not-7', serverId: 7, latitude: 1.5, longitude: 2.5 })
  await seedExplorerProfile(database, { homeCityId: 7 })

  expect(await readFallbackCenter(database)).toEqual({ latitude: 1.5, longitude: 2.5 })
})

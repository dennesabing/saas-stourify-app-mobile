import { countDeltaRows, createObservedClient, createSanitizeRaw, createStourifySyncEngine } from '@/sync/engine'
import { createTestDatabase } from '../support/testDatabase'
import type Spot from '@/db/models/Spot'
import type City from '@/db/models/City'
import delta from '../fixtures/m2a-delta.json'
import pushResponse from '../fixtures/m2a-push-response.json'
import AsyncStorage from '@react-native-async-storage/async-storage'

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>()
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      setItem: jest.fn((k: string, v: string) => {
        store.set(k, v)
        return Promise.resolve()
      }),
      removeItem: jest.fn((k: string) => {
        store.delete(k)
        return Promise.resolve()
      }),
    },
  }
})

const NETWORK_FAILURE_MARKER = Symbol.for('offline-sync-core.networkFailure')

function networkError(message: string): Error {
  const error = new Error(message)
  Object.defineProperty(error, NETWORK_FAILURE_MARKER, { value: true, enumerable: false, configurable: true })
  return error
}

describe('createSanitizeRaw against the REAL captured delta', () => {
  const sanitize = createSanitizeRaw()

  it('drops the server numeric id, because the schema has no id column', () => {
    // `server_id` is written by the engine straight onto `_raw`
    // (syncEngine.ts:51), bypassing the sanitizer entirely. If the sanitizer
    // emitted `id` it would collide with WatermelonDB's own record id.
    const row = (delta as Record<string, any>).sto_cities.created[0]
    const out = sanitize('sto_cities', row)

    expect(out.id).toBeUndefined()
    expect(out.uuid).toBe(row.uuid)
  })

  it('coerces ISO8601 timestamps to epoch milliseconds', () => {
    const row = (delta as Record<string, any>).sto_cities.created[0]
    const out = sanitize('sto_cities', row)

    expect(typeof out.created_at).toBe('number')
    expect(out.created_at).toBe(Date.parse(row.created_at))
  })

  it('drops any column the local schema does not declare', () => {
    const row = { ...(delta as Record<string, any>).sto_cities.created[0], not_a_column: 'x' }
    const out = sanitize('sto_cities', row)

    expect(out.not_a_column).toBeUndefined()
  })

  it('returns nothing at all for a table the schema does not know', () => {
    expect(sanitize('sto_posts', { uuid: 'x' })).toEqual({})
  })

  it('preserves a JSON array as JSON text rather than flattening it to "a,b"', () => {
    // The captured push response carries a server-canonical spot with a real
    // `categories` array. String(["coast","nature"]) is "coast,nature" — lossy —
    // so JSON columns are encoded before the package sanitizer sees them.
    const record = (pushResponse as Record<string, any>).data.results.find(
      (r: any) => r.table === 'sto_spots' && r.status === 'ok',
    ).record

    const out = sanitize('sto_spots', record)

    expect(typeof out.categories).toBe('string')
    expect(JSON.parse(out.categories as string)).toEqual(record.categories)
  })

  it('preserves a null JSON column as null, not the string "null"', () => {
    const row = (delta as Record<string, any>).sto_spots.created[0]
    expect(row.hours).toBeNull()

    const out = sanitize('sto_spots', row)

    expect(out.hours).toBeNull()
  })
})

describe('countDeltaRows', () => {
  it('counts created, updated and deleted across every table', () => {
    expect(
      countDeltaRows({
        server_time: 'now',
        sto_spots: { created: [{ uuid: 'a' }], updated: [{ uuid: 'b' }], deleted: ['c'] },
        sto_cities: { created: [], updated: [], deleted: [] },
      } as any),
    ).toBe(3)
  })

  it('counts the real captured delta without throwing on server_time', () => {
    expect(countDeltaRows(delta as any)).toBeGreaterThan(0)
  })
})

describe('createObservedClient', () => {
  it('records the row count of a successful pull', async () => {
    const observed = { rows: 0, error: null as unknown, networkFailure: false }
    const client = createObservedClient(
      { get: async () => ({ data: { server_time: 'now', sto_spots: { created: [{ uuid: 'a' }], updated: [], deleted: [] } } as any }) },
      observed,
    )

    await client.get('/stourify/sync/delta')

    expect(observed.rows).toBe(1)
    expect(observed.error).toBeNull()
    expect(observed.networkFailure).toBe(false)
  })

  it('records a network failure and rethrows so the engine still skips the cursor write', async () => {
    const observed = { rows: 0, error: null as unknown, networkFailure: false }
    const client = createObservedClient(
      {
        get: async () => {
          throw networkError('Network request failed')
        },
      },
      observed,
    )

    await expect(client.get('/stourify/sync/delta')).rejects.toThrow('Network request failed')
    expect(observed.networkFailure).toBe(true)
    expect(observed.error).not.toBeNull()
  })

  it('records an HTTP error as an error but NOT as a network failure', async () => {
    const observed = { rows: 0, error: null as unknown, networkFailure: false }
    const client = createObservedClient(
      {
        get: async () => {
          throw new Error('HTTP 500')
        },
      },
      observed,
    )

    await expect(client.get('/stourify/sync/delta')).rejects.toThrow('HTTP 500')
    expect(observed.networkFailure).toBe(false)
    expect(observed.error).not.toBeNull()
  })
})

describe('createStourifySyncEngine', () => {
  it('applies the real captured delta into the local database', async () => {
    const database = createTestDatabase()
    const engine = createStourifySyncEngine(database, { get: async () => ({ data: delta as any }) })

    const result = await engine.runPullSync()

    expect(result.error).toBeNull()
    const cityCount = await database.get<City>('sto_cities').query().fetchCount()
    expect(cityCount).toBe((delta as Record<string, any>).sto_cities.created.length)
  })

  it('keys rows by uuid and preserves the numeric server id', async () => {
    const database = createTestDatabase()
    const cityRow = (delta as Record<string, any>).sto_cities.created[0]
    const engine = createStourifySyncEngine(database, { get: async () => ({ data: delta as any }) })

    await engine.runPullSync()

    const city = await database.get<City>('sto_cities').find(cityRow.uuid)
    expect(city.uuid).toBe(cityRow.uuid)
    expect(city.serverId).toBe(cityRow.id)
  })

  it('is idempotent — pulling the same delta twice leaves one row per uuid', async () => {
    const database = createTestDatabase()
    const engine = createStourifySyncEngine(database, { get: async () => ({ data: delta as any }) })

    await engine.runPullSync()
    await engine.runPullSync()

    expect(await database.get<City>('sto_cities').query().fetchCount()).toBe(
      (delta as Record<string, any>).sto_cities.created.length,
    )
  })

  it('hard-deletes a uuid the server reports as deleted', async () => {
    const database = createTestDatabase()
    const first = { server_time: 'a', sto_spots: { created: [{ id: 5, uuid: 'gone-1', title: 'Doomed', latitude: 1, longitude: 1, status: 'draft', is_verified: false, reviews_count: 0, saves_count: 0, created_at: '2026-07-01T00:00:00+00:00', updated_at: '2026-07-01T00:00:00+00:00' }], updated: [], deleted: [] } }
    const second = { server_time: 'b', sto_spots: { created: [], updated: [], deleted: ['gone-1'] } }

    let call = 0
    const engine = createStourifySyncEngine(database, {
      get: async () => ({ data: (call++ === 0 ? first : second) as any }),
    })

    await engine.runPullSync()
    expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(1)

    await engine.runPullSync()
    expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
  })

  it('resetSyncState removes the module cursor so the next pull backfills', async () => {
    const database = createTestDatabase()
    const engine = createStourifySyncEngine(database, { get: async () => ({ data: delta as any }) })

    await engine.runPullSync()
    expect(await AsyncStorage.getItem('sync:last_pulled_at:module:stourify')).not.toBeNull()

    await engine.resetSyncState()
    expect(await AsyncStorage.getItem('sync:last_pulled_at:module:stourify')).toBeNull()
  })
})

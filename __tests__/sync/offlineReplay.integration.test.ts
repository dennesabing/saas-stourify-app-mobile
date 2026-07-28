import { runSyncCycle } from '@/sync/cycle'
import type { PushResponse } from '@/sync/pushService'
import { uuidv4 } from '@/shared/utils/uuid'
import { createTestDatabase, seedCity } from '../support/testDatabase'
import type Spot from '@/db/models/Spot'

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

function offlineError(): Error {
  const error = new Error('Network request failed')
  Object.defineProperty(error, NETWORK_FAILURE_MARKER, {
    value: true,
    enumerable: false,
    configurable: true,
  })
  return error
}

const SPOT_UUID = uuidv4()

async function writeSpotOffline(database: ReturnType<typeof createTestDatabase>): Promise<void> {
  await database.write(async () => {
    await database.get<Spot>('sto_spots').create((row: any) => {
      row._raw.id = SPOT_UUID
      row._raw.uuid = SPOT_UUID
      row._raw.city_id = 3
      row._raw.title = 'Hidden Cove'
      row._raw.description = 'Created on the plane; drained on landing.'
      row._raw.latitude = 6.1164
      row._raw.longitude = 125.1716
      row._raw.status = 'draft'
      row._raw.is_verified = false
      row._raw.reviews_count = 0
      row._raw.saves_count = 0
      row._raw.categories = JSON.stringify(['coast', 'nature'])
      row._raw.created_at = 1_700_000_000_000
      row._raw.updated_at = 1_700_000_000_000
    })
  })
}

function okResponse(): PushResponse {
  return {
    results: [
      {
        table: 'sto_spots',
        uuid: SPOT_UUID,
        op: 'created',
        status: 'ok',
        record: {
          id: 900,
          uuid: SPOT_UUID,
          title: 'Hidden Cove',
          slug: 'hidden-cove',
          description: 'Created on the plane; drained on landing.',
          latitude: 6.1164,
          longitude: 125.1716,
          city_id: 3,
          status: 'draft',
          is_verified: false,
          rating_average: null,
          reviews_count: 0,
          saves_count: 0,
          categories: ['coast', 'nature'],
          created_at: '2026-07-28T03:00:00+00:00',
          updated_at: '2026-07-28T03:00:00+00:00',
          deleted_at: null,
        },
      },
    ],
    server_time: '2026-07-28T03:00:00+00:00',
  }
}

it('creates offline, drains on reconnect with the exact M2a envelope, and replays without duplicating', async () => {
  const database = createTestDatabase()
  await seedCity(database, { uuid: 'city-3b2a', serverId: 3, name: 'General Santos' })
  await writeSpotOffline(database)

  // --- offline: the push fails at the socket, so nothing changes at all -------
  const offlineGet = jest.fn()
  const offlinePost = jest.fn(async () => {
    throw offlineError()
  })

  const offlineCycle = await runSyncCycle({
    database,
    client: { get: offlineGet, post: offlinePost } as any,
    trigger: 'manual',
  })

  expect(offlineCycle.drain.networkFailure).toBe(true)
  expect(offlineCycle.pulled).toBe(false)
  // The pull MUST be skipped: it applies unconditional server-wins and would
  // destroy the unpushed row with no error and no log line.
  expect(offlineGet).not.toHaveBeenCalled()

  const stillQueued = await database.get<Spot>('sto_spots').find(SPOT_UUID)
  expect(stillQueued.isQueued).toBe(true)

  // --- reconnect: the drain sends the envelope M2a expects -------------------
  const sentEnvelopes: unknown[] = []
  const onlinePost = jest.fn(async (_path: string, body: unknown) => {
    sentEnvelopes.push(body)
    return { data: okResponse() }
  })
  const onlineGet = jest.fn(async () => ({ data: { server_time: '2026-07-28T03:00:01+00:00' } }))

  const onlineCycle = await runSyncCycle({
    database,
    client: { get: onlineGet, post: onlinePost } as any,
    trigger: 'connectivity',
  })

  expect(onlinePost).toHaveBeenCalledTimes(1)
  expect(onlinePost.mock.calls[0][0]).toBe('/stourify/sync/push')
  expect(sentEnvelopes[0]).toEqual({
    sto_spots: {
      created: [
        {
          uuid: SPOT_UUID,
          title: 'Hidden Cove',
          description: 'Created on the plane; drained on landing.',
          latitude: 6.1164,
          longitude: 125.1716,
          // A uuid, NOT the numeric city_id the row holds locally: the delta
          // speaks ids, the push speaks uuids (SpotStoreRequest.php:40).
          city_uuid: 'city-3b2a',
          categories: ['coast', 'nature'],
          status: 'draft',
        },
      ],
      updated: [],
      deleted: [],
    },
  })

  expect(onlineCycle.drain.fullyAcked).toBe(true)
  expect(onlineCycle.pulled).toBe(true)

  const acked = await database.get<Spot>('sto_spots').find(SPOT_UUID)
  expect(acked.isQueued).toBe(false)
  expect(acked.slug).toBe('hidden-cove')
  expect(acked.serverId).toBe(900)

  // --- replay: a second drain sends nothing and creates nothing --------------
  const replayPost = jest.fn(async () => ({ data: okResponse() }))
  const replayGet = jest.fn(async () => ({ data: { server_time: '2026-07-28T03:00:02+00:00' } }))

  await runSyncCycle({
    database,
    client: { get: replayGet, post: replayPost } as any,
    trigger: 'manual',
  })

  expect(replayPost).not.toHaveBeenCalled()
  expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(1)
})

it('a second identical push from the server still leaves exactly one row', async () => {
  // The server-side half of idempotency (M2a §4 point 3) resolves-then-upserts
  // by uuid; this asserts the client half — applying the same `ok` twice must
  // not fork the row.
  const database = createTestDatabase()
  await seedCity(database, { uuid: 'city-3b2a', serverId: 3 })
  await writeSpotOffline(database)

  const client = {
    get: jest.fn(async () => ({ data: { server_time: 'now' } })),
    post: jest.fn(async () => ({ data: okResponse() })),
  } as any

  await runSyncCycle({ database, client, trigger: 'manual' })
  await runSyncCycle({ database, client, trigger: 'manual' })

  expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(1)
})

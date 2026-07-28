import AsyncStorage from '@react-native-async-storage/async-storage'
import { isSyncInFlight, runSyncCycle } from '@/sync/cycle'
import { resetSyncStatus, useSyncStatusStore } from '@/sync/status'
import { createTestDatabase, markSynced, seedSpot } from '../support/testDatabase'
import type Spot from '@/db/models/Spot'

const DELTA_THAT_WOULD_CLOBBER = {
  server_time: '2026-07-28T02:00:00+00:00',
  sto_spots: {
    created: [],
    updated: [
      {
        id: 77,
        uuid: 'spot-local-edit',
        title: 'SERVER TITLE',
        slug: 'server-title',
        status: 'published',
        latitude: 1,
        longitude: 1,
        is_verified: false,
        reviews_count: 0,
        saves_count: 0,
        created_at: '2026-07-01T00:00:00+00:00',
        updated_at: '2026-07-28T02:00:00+00:00',
      },
    ],
    deleted: [],
  },
}

beforeEach(async () => {
  resetSyncStatus()
  // The AsyncStorage mock is a module-level singleton shared by every test in
  // this file (jest does not reset it between `it` blocks) — several tests
  // here assert on the pull cursor's presence/absence, so each must start
  // from a clean store or they observe a previous test's write.
  await AsyncStorage.clear()
})

it('drains then pulls when the drain fully acks', async () => {
  const database = createTestDatabase()
  const get = jest.fn(async () => ({ data: { server_time: 'now' } }))
  const post = jest.fn()

  const outcome = await runSyncCycle({ database, client: { get, post } as any, trigger: 'manual' })

  expect(post).not.toHaveBeenCalled()
  expect(get).toHaveBeenCalledTimes(1)
  expect(outcome.drain.fullyAcked).toBe(true)
  expect(outcome.pulled).toBe(true)
})

it('SKIPS the pull when a row is left un-acked, so the local edit survives', async () => {
  const database = createTestDatabase()
  const spot = await seedSpot(database, { uuid: 'spot-local-edit', title: 'SEED TITLE' })
  await markSynced(database, spot)
  await database.write(async () => {
    await spot.update((row: Spot) => {
      row._setRaw('title', 'LOCAL TITLE')
    })
  })

  const get = jest.fn(async () => ({ data: DELTA_THAT_WOULD_CLOBBER }))
  const post = jest.fn(async () => ({
    data: {
      results: [{ table: 'sto_spots', uuid: 'spot-local-edit', op: 'updated', status: 'rejected', reason: 'validation', errors: { title: ['nope'] } }],
      server_time: 'now',
    },
  }))

  const outcome = await runSyncCycle({ database, client: { get, post } as any, trigger: 'manual' })

  expect(post).toHaveBeenCalledTimes(1)
  expect(get).not.toHaveBeenCalled()
  expect(outcome.pulled).toBe(false)

  const after = await database.get<Spot>('sto_spots').find('spot-local-edit')
  expect(after.title).toBe('LOCAL TITLE')
})

it('skips the pull on a network failure and leaves the cursor alone', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-offline' })

  const marker = Symbol.for('offline-sync-core.networkFailure')
  const get = jest.fn()
  const post = jest.fn(async () => {
    const error = new Error('Network request failed')
    Object.defineProperty(error, marker, { value: true, enumerable: false, configurable: true })
    throw error
  })

  const outcome = await runSyncCycle({ database, client: { get, post } as any, trigger: 'connectivity' })

  expect(get).not.toHaveBeenCalled()
  expect(outcome.pulled).toBe(false)
  expect(outcome.drain.networkFailure).toBe(true)
  expect(await AsyncStorage.getItem('sync:last_pulled_at:module:stourify')).toBeNull()
})

it('holds a mutex so two overlapping cycles do not interleave writes', async () => {
  const database = createTestDatabase()
  let inFlight = 0
  let maxConcurrent = 0

  const get = jest.fn(async () => {
    inFlight += 1
    maxConcurrent = Math.max(maxConcurrent, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 10))
    inFlight -= 1
    return { data: { server_time: 'now' } }
  })

  const client = { get, post: jest.fn() } as any
  const [first, second] = await Promise.all([
    runSyncCycle({ database, client, trigger: 'foreground' }),
    runSyncCycle({ database, client, trigger: 'manual' }),
  ])

  expect(maxConcurrent).toBe(1)
  expect(get).toHaveBeenCalledTimes(1)
  expect([first.skipped, second.skipped]).toContain('in-flight')
  expect(isSyncInFlight()).toBe(false)
})

it('publishes queue depth, failures and last-synced into the status store', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-status' })

  const post = jest.fn(async () => ({
    data: {
      results: [{ table: 'sto_spots', uuid: 'spot-status', op: 'created', status: 'rejected', reason: 'validation', errors: { title: ['too short'] } }],
      server_time: 'now',
    },
  }))

  await runSyncCycle({ database, client: { get: jest.fn(), post } as any, trigger: 'manual' })

  const state = useSyncStatusStore.getState()
  expect(state.phase).toBe('idle')
  expect(state.pendingCount).toBe(1)
  expect(state.failures).toHaveLength(1)
  expect(state.failures[0].reason).toBe('validation')
  expect(state.lastSyncedAt).toBeNull()
})

it('stamps lastSyncedAt only when the cycle both drained and pulled', async () => {
  const database = createTestDatabase()

  await runSyncCycle({
    database,
    client: { get: jest.fn(async () => ({ data: { server_time: 'now' } })), post: jest.fn() } as any,
    trigger: 'login',
  })

  expect(useSyncStatusStore.getState().lastSyncedAt).not.toBeNull()
})

it('resets phase to idle and releases the mutex when an ordinary error escapes the drain', async () => {
  const database = createTestDatabase()
  // Simulates a DB read failure inside `collectDirtyBatch` — not one of the
  // handled network-failure cases — escaping `drainOutbox` uncaught.
  jest.spyOn(database, 'get').mockImplementation(() => {
    throw new Error('boom: local read failed')
  })

  await expect(
    runSyncCycle({ database, client: { get: jest.fn(), post: jest.fn() } as any, trigger: 'manual' }),
  ).rejects.toThrow('boom: local read failed')

  expect(isSyncInFlight()).toBe(false)
  expect(useSyncStatusStore.getState().phase).toBe('idle')

  jest.spyOn(database, 'get').mockRestore()

  // A subsequent cycle must be able to start — the mutex was not left held.
  const get = jest.fn(async () => ({ data: { server_time: 'now' } }))
  const outcome = await runSyncCycle({ database, client: { get, post: jest.fn() } as any, trigger: 'manual' })
  expect(outcome.skipped).toBeNull()
  expect(get).toHaveBeenCalledTimes(1)
})

it('clears a stale offline flag once a later drain succeeds over the network, even if the gate then trips', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-flaky' })

  const marker = Symbol.for('offline-sync-core.networkFailure')
  const failingPost = jest.fn(async () => {
    const error = new Error('Network request failed')
    Object.defineProperty(error, marker, { value: true, enumerable: false, configurable: true })
    throw error
  })

  await runSyncCycle({ database, client: { get: jest.fn(), post: failingPost } as any, trigger: 'connectivity' })
  expect(useSyncStatusStore.getState().offline).toBe(true)

  // Cycle 2: the POST itself succeeds (proof of connectivity) but the row it
  // carries is rejected for a non-network reason — the gate still trips and
  // the pull is skipped, but `offline` must not stay stuck at `true`.
  const post2 = jest.fn(async () => ({
    data: {
      results: [{ table: 'sto_spots', uuid: 'spot-flaky', op: 'created', status: 'rejected', reason: 'validation', errors: {} }],
      server_time: 'now',
    },
  }))
  const get2 = jest.fn()

  const outcome = await runSyncCycle({ database, client: { get: get2, post: post2 } as any, trigger: 'manual' })

  expect(post2).toHaveBeenCalledTimes(1)
  expect(get2).not.toHaveBeenCalled()
  expect(outcome.pulled).toBe(false)
  expect(useSyncStatusStore.getState().offline).toBe(false)
})

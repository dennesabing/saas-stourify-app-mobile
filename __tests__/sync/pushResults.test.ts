import {
  applyPushResults,
  collectDirtyBatch,
  drainOutbox,
  listSyncFailures,
  loadExcludedRecordIds,
  normalizeRejectionReason,
  type PushResponse,
} from '@/sync/pushService'
import { createTestDatabase, markSynced, seedSpot } from '../support/testDatabase'
import type Spot from '@/db/models/Spot'
import pushResponse from '../fixtures/m2a-push-response.json'

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

function respondWith(response: PushResponse) {
  return { post: async () => ({ data: response }) }
}

describe('normalizeRejectionReason', () => {
  it('passes through the three reasons SyncController actually emits', () => {
    expect(normalizeRejectionReason('validation')).toBe('validation')
    expect(normalizeRejectionReason('forbidden')).toBe('forbidden')
    expect(normalizeRejectionReason('error')).toBe('error')
  })

  it('treats anything else — including the server’s "unsupported" and "conflict" — as error', () => {
    expect(normalizeRejectionReason('unsupported')).toBe('error')
    expect(normalizeRejectionReason('conflict')).toBe('error')
    expect(normalizeRejectionReason(undefined)).toBe('error')
  })
})

describe('applyPushResults', () => {
  it('writes the server-canonical record back and clears the queued flag', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-ok', title: 'Offline title' })
    const batch = await collectDirtyBatch(database, new Set())

    await applyPushResults(
      database,
      [
        {
          table: 'sto_spots',
          uuid: 'spot-ok',
          op: 'created',
          status: 'ok',
          record: {
            id: 501,
            uuid: 'spot-ok',
            title: 'Offline title',
            slug: 'offline-title',
            status: 'published',
            latitude: 6.1164,
            longitude: 125.1716,
            is_verified: false,
            rating_average: null,
            reviews_count: 0,
            saves_count: 0,
            categories: ['coast'],
            created_at: '2026-07-28T01:00:00+00:00',
            updated_at: '2026-07-28T01:00:00+00:00',
          },
        },
      ],
      batch,
    )

    const spot = await database.get<Spot>('sto_spots').find('spot-ok')

    expect(spot.isQueued).toBe(false)
    expect(spot.slug).toBe('offline-title')
    expect(spot.status).toBe('published')
    expect(spot.serverId).toBe(501)
    expect(spot.categories).toEqual(['coast'])
  })

  it('applies the REAL captured push response without loss', async () => {
    const database = createTestDatabase()
    const result = (pushResponse as Record<string, any>).data.results.find(
      (r: any) => r.table === 'sto_spots' && r.status === 'ok' && r.op !== 'deleted',
    )
    await seedSpot(database, { uuid: result.uuid, title: 'local' })
    const batch = await collectDirtyBatch(database, new Set())

    await applyPushResults(database, (pushResponse as Record<string, any>).data.results, batch)

    const spot = await database.get<Spot>('sto_spots').find(result.uuid)
    expect(spot.isQueued).toBe(false)
    expect(spot.slug).toBe(result.record.slug)
    expect(spot.serverId).toBe(result.record.id)
  })

  it('records a validation rejection and excludes the row from the next drain', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-bad', title: 'x' })
    const batch = await collectDirtyBatch(database, new Set())

    await applyPushResults(
      database,
      [
        {
          table: 'sto_spots',
          uuid: 'spot-bad',
          op: 'created',
          status: 'rejected',
          reason: 'validation',
          errors: { title: ['The title must be at least 3 characters.'] },
        },
      ],
      batch,
    )

    const spot = await database.get<Spot>('sto_spots').find('spot-bad')
    expect(spot.isQueued).toBe(true)

    const excluded = await loadExcludedRecordIds(database)
    expect(excluded.has('spot-bad')).toBe(true)

    const next = await collectDirtyBatch(database, excluded)
    expect(next.count).toBe(0)
  })

  it('records a forbidden rejection the same way', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-forbidden' })
    const batch = await collectDirtyBatch(database, new Set())

    await applyPushResults(
      database,
      [{ table: 'sto_spots', uuid: 'spot-forbidden', op: 'created', status: 'rejected', reason: 'forbidden', errors: { authorization: ['Denied.'] } }],
      batch,
    )

    expect((await loadExcludedRecordIds(database)).has('spot-forbidden')).toBe(true)
  })

  it('keeps an error rejection eligible for retry and bumps attempts', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-dup' })
    const batch = await collectDirtyBatch(database, new Set())
    const rejection = {
      table: 'sto_spots',
      uuid: 'spot-dup',
      op: 'created' as const,
      status: 'rejected' as const,
      reason: 'error',
      errors: { exception: ['Duplicate entry'] },
    }

    await applyPushResults(database, [rejection], batch)
    await applyPushResults(database, [rejection], batch)

    const failures = await listSyncFailures(database)
    expect(failures[0].attempts).toBe(2)
    expect((await loadExcludedRecordIds(database)).size).toBe(0)
  })

  it('clears an existing failure when a later push succeeds', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-recovers' })
    const batch = await collectDirtyBatch(database, new Set())

    await applyPushResults(
      database,
      [{ table: 'sto_spots', uuid: 'spot-recovers', op: 'created', status: 'rejected', reason: 'error', errors: {} }],
      batch,
    )
    expect(await listSyncFailures(database)).toHaveLength(1)

    await applyPushResults(
      database,
      [{ table: 'sto_spots', uuid: 'spot-recovers', op: 'created', status: 'ok', record: { id: 9, uuid: 'spot-recovers', title: 'ok', slug: 'ok', status: 'draft', latitude: 1, longitude: 1, is_verified: false, reviews_count: 0, saves_count: 0, created_at: '2026-07-28T01:00:00+00:00', updated_at: '2026-07-28T01:00:00+00:00' } }],
      batch,
    )

    expect(await listSyncFailures(database)).toHaveLength(0)
  })

  it('destroys an acked delete permanently so it never re-drains', async () => {
    const database = createTestDatabase()
    const spot = await seedSpot(database, { uuid: 'spot-deleted' })
    await markSynced(database, spot)
    await database.write(async () => {
      await spot.markAsDeleted()
    })
    const batch = await collectDirtyBatch(database, new Set())
    expect(batch.envelope.sto_spots.deleted).toEqual(['spot-deleted'])

    await applyPushResults(
      database,
      [{ table: 'sto_spots', uuid: 'spot-deleted', op: 'deleted', status: 'ok', record: { uuid: 'spot-deleted' } }],
      batch,
    )

    expect(await database.adapter.getDeletedRecords('sto_spots')).toEqual([])
  })
})

describe('drainOutbox', () => {
  it('does nothing and reports fullyAcked when there is nothing dirty', async () => {
    const database = createTestDatabase()
    const post = jest.fn()

    const outcome = await drainOutbox(database, { post } as any)

    expect(post).not.toHaveBeenCalled()
    expect(outcome).toEqual({ attempted: 0, acked: 0, rejected: 0, excluded: 0, fullyAcked: true, networkFailure: false, error: null })
  })

  it('posts the envelope and reports a full ack', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-drain', title: 'Hidden Cove' })

    const post = jest.fn(async () => ({
      data: {
        results: [{ table: 'sto_spots', uuid: 'spot-drain', op: 'created', status: 'ok', record: { id: 11, uuid: 'spot-drain', title: 'Hidden Cove', slug: 'hidden-cove', status: 'draft', latitude: 6.1164, longitude: 125.1716, is_verified: false, reviews_count: 0, saves_count: 0, created_at: '2026-07-28T01:00:00+00:00', updated_at: '2026-07-28T01:00:00+00:00' } }],
        server_time: '2026-07-28T01:00:00+00:00',
      } as PushResponse,
    }))

    const outcome = await drainOutbox(database, { post } as any)

    expect(post).toHaveBeenCalledWith('/stourify/sync/push', {
      sto_spots: {
        created: [{ uuid: 'spot-drain', title: 'Hidden Cove', latitude: 6.1164, longitude: 125.1716, status: 'draft' }],
        updated: [],
        deleted: [],
      },
    })
    expect(outcome.attempted).toBe(1)
    expect(outcome.acked).toBe(1)
    expect(outcome.fullyAcked).toBe(true)
  })

  it('reports NOT fully acked when one row is rejected', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-1' })
    await seedSpot(database, { uuid: 'spot-2' })

    const outcome = await drainOutbox(
      database,
      respondWith({
        results: [
          { table: 'sto_spots', uuid: 'spot-1', op: 'created', status: 'ok', record: { id: 1, uuid: 'spot-1', title: 'Seeded Spot', slug: 's1', status: 'draft', latitude: 1, longitude: 1, is_verified: false, reviews_count: 0, saves_count: 0, created_at: '2026-07-28T01:00:00+00:00', updated_at: '2026-07-28T01:00:00+00:00' } },
          { table: 'sto_spots', uuid: 'spot-2', op: 'created', status: 'rejected', reason: 'validation', errors: { title: ['too short'] } },
        ],
        server_time: '2026-07-28T01:00:00+00:00',
      }) as any,
    )

    expect(outcome.acked).toBe(1)
    expect(outcome.rejected).toBe(1)
    expect(outcome.fullyAcked).toBe(false)
  })

  it('leaves everything untouched on a network failure — no failure row, no attempt bump', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-offline' })

    const outcome = await drainOutbox(
      database,
      {
        post: async () => {
          throw networkError('Network request failed')
        },
      } as any,
    )

    expect(outcome.networkFailure).toBe(true)
    expect(outcome.fullyAcked).toBe(false)
    expect(await listSyncFailures(database)).toEqual([])

    const spot = await database.get<Spot>('sto_spots').find('spot-offline')
    expect(spot.isQueued).toBe(true)
  })

  it('records an HTTP error as an error without marking it a network failure', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-500' })

    const outcome = await drainOutbox(
      database,
      {
        post: async () => {
          throw new Error('HTTP 500')
        },
      } as any,
    )

    expect(outcome.networkFailure).toBe(false)
    expect(outcome.error).not.toBeNull()
    expect(outcome.fullyAcked).toBe(false)
  })

  it('reports excluded rows, which keep the drain from being fully acked', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-stuck' })

    await drainOutbox(
      database,
      respondWith({
        results: [{ table: 'sto_spots', uuid: 'spot-stuck', op: 'created', status: 'rejected', reason: 'validation', errors: {} }],
        server_time: 'now',
      }) as any,
    )

    const second = await drainOutbox(database, respondWith({ results: [], server_time: 'now' }) as any)

    expect(second.attempted).toBe(0)
    expect(second.excluded).toBe(1)
    expect(second.fullyAcked).toBe(false)
  })
})

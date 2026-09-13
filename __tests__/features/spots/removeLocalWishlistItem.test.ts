import type { Database } from '@nozbe/watermelondb'
import type WishlistItem from '@/db/models/WishlistItem'
import { removeLocalWishlistItem } from '@/features/spots/api/removeLocalWishlistItem'
import {
  collectDirtyBatch,
  drainOutbox,
  listSyncFailures,
  upsertSyncFailure,
  type PushResponse,
} from '@/sync/pushService'
import { listPendingQueue } from '@/sync/queue'
import { createTestDatabase, markSynced } from '../../support/testDatabase'

/**
 * STOURIFY-303. Unsaving is like changing your mind about a letter. Still on
 * your desk, you just bin it and nobody ever knows. Already posted, you have to
 * send a second letter saying "ignore the first". These tests pin which of the
 * two happens, because the card's hardest rule lives in the difference: a save
 * the server never had must never cause a request at all.
 */

const NETWORK_FAILURE_MARKER = Symbol.for('offline-sync-core.networkFailure')

function networkError(message: string): Error {
  const error = new Error(message)
  Object.defineProperty(error, NETWORK_FAILURE_MARKER, {
    value: true,
    enumerable: false,
    configurable: true,
  })
  return error
}

const idle = { isSyncInFlight: () => false }
const syncing = { isSyncInFlight: () => true }

/** A save as tapping Save writes it: on the phone, not yet sent. */
async function seedSave(
  database: Database,
  { id = 'save-1', spotUuid = 'spot-1' }: { id?: string; spotUuid?: string } = {},
): Promise<WishlistItem> {
  return database.write(async () =>
    database.get<WishlistItem>('sto_wishlist_items').create((row: any) => {
      row._raw.id = id
      row._raw.uuid = id
      row._raw.spot_id = null
      row._raw.spot_uuid = spotUuid
      row._raw.note = null
      row._raw.is_downloaded_offline = false
      row._raw.created_at = 1
      row._raw.updated_at = 1
    }),
  )
}

function savesOnPhone(database: Database): Promise<number> {
  return database.get('sto_wishlist_items').query().fetchCount()
}

function markedForRemoval(database: Database): Promise<string[]> {
  return database.adapter.getDeletedRecords('sto_wishlist_items')
}

describe('a save the phone never sent', () => {
  it('is thrown away: no row, nothing marked for removal, and no failure left behind', async () => {
    const database = createTestDatabase()
    await seedSave(database)
    await upsertSyncFailure(database, {
      recordId: 'save-1',
      tableName: 'sto_wishlist_items',
      reason: 'validation',
      lastError: '{}',
    })

    await removeLocalWishlistItem(database, { spotUuid: 'spot-1' }, idle)

    expect(await savesOnPhone(database)).toBe(0)
    expect(await markedForRemoval(database)).toEqual([])
    expect(await listSyncFailures(database)).toEqual([])
  })

  it('never reaches the server: the next sync sends no request at all', async () => {
    const database = createTestDatabase()
    await seedSave(database)
    await removeLocalWishlistItem(database, { spotUuid: 'spot-1' }, idle)

    const post = jest.fn()
    const outcome = await drainOutbox(database, { post } as any)

    expect(post).not.toHaveBeenCalled()
    expect(outcome.fullyAcked).toBe(true)
  })

  it('leaves nothing waiting on the Sync status screen', async () => {
    const database = createTestDatabase()
    await seedSave(database)

    await removeLocalWishlistItem(database, { spotUuid: 'spot-1' }, idle)

    expect(await listPendingQueue(database)).toEqual([])
  })

  /**
   * The push carrying this save may already be on its way. Binning the row
   * would not stop the server creating it, and would throw away the only thing
   * that could delete it afterwards.
   */
  it('is marked for removal instead when a sync is already running', async () => {
    const database = createTestDatabase()
    await seedSave(database)

    await removeLocalWishlistItem(database, { spotUuid: 'spot-1' }, syncing)

    expect(await savesOnPhone(database)).toBe(0)
    expect(await markedForRemoval(database)).toEqual(['save-1'])
  })
})

describe('a save the server already has', () => {
  it('is marked for removal, and the next push sends its uuid under deleted', async () => {
    const database = createTestDatabase()
    await markSynced(database, await seedSave(database))

    await removeLocalWishlistItem(database, { spotUuid: 'spot-1' }, idle)

    expect(await savesOnPhone(database)).toBe(0)
    const batch = await collectDirtyBatch(database, new Set())
    expect(batch.envelope.sto_wishlist_items).toEqual({
      created: [],
      updated: [],
      deleted: ['save-1'],
    })
  })

  it('reads "Removed a saved spot" on the Sync status screen while it waits', async () => {
    const database = createTestDatabase()
    await markSynced(database, await seedSave(database))

    await removeLocalWishlistItem(database, { spotUuid: 'spot-1' }, idle)

    expect(await listPendingQueue(database)).toEqual([
      expect.objectContaining({
        id: 'save-1',
        tableName: 'sto_wishlist_items',
        op: 'deleted',
        kind: 'wishlist',
        title: 'Removed a saved spot',
        meta: 'Waiting to send',
      }),
    ])
  })

  it('waits through a failed send and goes out with the next one', async () => {
    const database = createTestDatabase()
    await markSynced(database, await seedSave(database))
    await removeLocalWishlistItem(database, { spotUuid: 'spot-1' }, idle)

    const offline = await drainOutbox(database, {
      post: async () => {
        throw networkError('Network Error')
      },
    } as any)
    expect(offline.networkFailure).toBe(true)
    expect(await markedForRemoval(database)).toEqual(['save-1'])

    const post = jest.fn(async () => ({
      data: {
        results: [
          {
            table: 'sto_wishlist_items',
            uuid: 'save-1',
            op: 'deleted',
            status: 'ok',
            record: { uuid: 'save-1' },
          },
        ],
        server_time: '2026-09-14T00:00:00+00:00',
      } as PushResponse,
    }))
    const online = await drainOutbox(database, { post } as any)

    expect(post).toHaveBeenCalledWith('/stourify/sync/push', {
      sto_wishlist_items: { created: [], updated: [], deleted: ['save-1'] },
    })
    expect(online.fullyAcked).toBe(true)
    expect(await markedForRemoval(database)).toEqual([])
    expect(await listPendingQueue(database)).toEqual([])
  })

  it("can be removed by the save's own uuid as well as by its spot", async () => {
    const database = createTestDatabase()
    await markSynced(database, await seedSave(database))

    await removeLocalWishlistItem(database, { saveUuid: 'save-1' }, idle)

    expect(await markedForRemoval(database)).toEqual(['save-1'])
  })

  it('takes every save the phone holds for that spot, each the right way', async () => {
    const database = createTestDatabase()
    await markSynced(database, await seedSave(database, { id: 'save-sent' }))
    await seedSave(database, { id: 'save-unsent' })

    await removeLocalWishlistItem(database, { spotUuid: 'spot-1' }, idle)

    expect(await savesOnPhone(database)).toBe(0)
    expect(await markedForRemoval(database)).toEqual(['save-sent'])
  })
})

describe('a save only the server knows about', () => {
  /**
   * The Wishlist screen lists the server's saves, and the phone may not have
   * pulled one down yet. Removing it still has to reach the server, so the
   * phone writes the removal marker itself.
   */
  it('leaves a removal marker, so the next push deletes it', async () => {
    const database = createTestDatabase()

    await removeLocalWishlistItem(database, { saveUuid: 'server-save-7', spotUuid: 'spot-7' }, idle)

    expect(await savesOnPhone(database)).toBe(0)
    const batch = await collectDirtyBatch(database, new Set())
    expect(batch.envelope.sto_wishlist_items.deleted).toEqual(['server-save-7'])
  })

  it('does nothing when there is no row and no save to name', async () => {
    const database = createTestDatabase()

    await removeLocalWishlistItem(database, { spotUuid: 'spot-nowhere' }, idle)

    expect(await markedForRemoval(database)).toEqual([])
    expect(await savesOnPhone(database)).toBe(0)
  })
})

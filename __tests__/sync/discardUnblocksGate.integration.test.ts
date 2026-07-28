import type { HttpClient } from '@soxerp/offline-sync-core'
import { runSyncCycle } from '@/sync/cycle'
import { discardRecord } from '@/sync/queue'
import { createTestDatabase, seedSpot } from '../support/testDatabase'

function rejectingClient(): HttpClient & { pulls: number } {
  const client = {
    pulls: 0,
    async post() {
      return {
        data: {
          results: [
            {
              table: 'sto_spots',
              uuid: 'spot-bad',
              op: 'created',
              status: 'rejected',
              reason: 'validation',
              errors: { title: ['The title field is required.'] },
            },
          ],
          server_time: '2026-07-29T00:00:00Z',
        },
      }
    },
    async get() {
      client.pulls += 1
      return { data: { sto_spots: { created: [], updated: [], deleted: [] }, server_time: '2026-07-29T00:00:00Z' } }
    },
  }

  return client as unknown as HttpClient & { pulls: number }
}

it('a rejected row stalls the pull, and discarding it lets the pull run again', async () => {
  const database = createTestDatabase()
  const client = rejectingClient()
  await seedSpot(database, { uuid: 'spot-bad', title: '' })

  // Cycle 1: the push is rejected, so the gate shuts and no pull happens.
  const first = await runSyncCycle({ database, client, trigger: 'manual' })
  expect(first.drain.rejected).toBe(1)
  expect(first.drain.fullyAcked).toBe(false)
  expect(first.pulled).toBe(false)
  expect(client.pulls).toBe(0)

  // Cycle 2: the row is now excluded, so it is not even attempted — and the
  // gate STILL shuts, because an excluded row is un-acked. This is the stall.
  const second = await runSyncCycle({ database, client, trigger: 'manual' })
  expect(second.drain.attempted).toBe(0)
  expect(second.drain.excluded).toBe(1)
  expect(second.pulled).toBe(false)
  expect(client.pulls).toBe(0)

  // The escape hatch.
  await discardRecord(database, 'sto_spots', 'spot-bad')

  const third = await runSyncCycle({ database, client, trigger: 'manual' })
  expect(third.drain.excluded).toBe(0)
  expect(third.drain.fullyAcked).toBe(true)
  expect(third.pulled).toBe(true)
  expect(client.pulls).toBe(1)
})

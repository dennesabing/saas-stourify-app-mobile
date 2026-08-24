import type { Database } from '@nozbe/watermelondb'
import { syncNow } from '@/sync/scheduler'
import { SYNC_ON_OPEN_COOLDOWN_MS, resetSyncOnOpen, syncOnScreenOpen } from '@/sync/openTrigger'

jest.mock('@/sync/scheduler', () => ({ syncNow: jest.fn(async () => undefined) }))

/**
 * The trigger never touches the database — it only hands it to `syncNow`, which
 * is mocked here — so a stand-in object is enough and a real WatermelonDB
 * instance would only slow the suite down.
 */
const database = { name: 'stub' } as unknown as Database

beforeEach(() => {
  jest.clearAllMocks()
  resetSyncOnOpen()
})

it('starts one cycle the first time the screen is opened', async () => {
  await syncOnScreenOpen(database, 1_000)

  expect(syncNow).toHaveBeenCalledTimes(1)
  expect(syncNow).toHaveBeenCalledWith(database, 'screen-open')
})

it('starts nothing when the screen is re-opened inside the cooling-off window', async () => {
  await syncOnScreenOpen(database, 1_000)
  const outcome = await syncOnScreenOpen(database, 1_000 + SYNC_ON_OPEN_COOLDOWN_MS - 1)

  expect(syncNow).toHaveBeenCalledTimes(1)
  expect(outcome).toBeNull()
})

it('starts another cycle once the window has passed', async () => {
  await syncOnScreenOpen(database, 1_000)
  await syncOnScreenOpen(database, 1_000 + SYNC_ON_OPEN_COOLDOWN_MS)

  expect(syncNow).toHaveBeenCalledTimes(2)
})

it('lets only one of two opens in the same tick through', async () => {
  // Both calls are started before either is awaited, which is what two mounts
  // in one render pass look like. The clock has to be stamped before the cycle
  // is awaited or both would get past the check.
  const [first, second] = await Promise.all([
    syncOnScreenOpen(database, 1_000),
    syncOnScreenOpen(database, 1_000),
  ])

  expect(syncNow).toHaveBeenCalledTimes(1)
  expect(first === null || second === null).toBe(true)
})

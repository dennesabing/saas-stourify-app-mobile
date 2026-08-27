import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Database } from '@nozbe/watermelondb'
import { requestUploadUrl } from '@/shared/api/media'
import { isSyncInFlight, runSyncCycle } from '@/sync/cycle'
import { resetSyncStatus, useSyncStatusStore } from '@/sync/status'
import { createTestDatabase, markSynced, seedSpot } from '../support/testDatabase'
import type Spot from '@/db/models/Spot'
import type PendingMedia from '@/db/models/PendingMedia'

jest.mock('@/shared/api/media', () => ({
  requestUploadUrl: jest.fn(async () => {
    throw Object.assign(new Error('stuck upload'), {
      isAxiosError: true,
      response: { status: 500, data: {} },
    })
  }),
  putFile: jest.fn(),
  attachMedia: jest.fn(),
}))

/**
 * The send-later post queue (STOURIFY-161) drains through the app's own
 * Sanctum client, not the stand-in client this suite hands `runSyncCycle`. Left
 * real it would attempt an actual HTTP request and time the test out — so it is
 * stubbed here to answer the way a reachable server that refuses the post
 * would. What these tests are about is WHETHER the phase runs, never what the
 * server said.
 */
jest.mock('@/shared/api/posts', () => ({
  createPost: jest.fn(async () => {
    throw Object.assign(new Error('refused'), {
      isAxiosError: true,
      response: { status: 422, data: { message: 'The server refused this post.' } },
    })
  }),
  publishPost: jest.fn(),
}))

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string
    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }
    get exists() {
      return true
    }
    async bytes() {
      return new Uint8Array()
    }
    delete() {}
  }
  return { __esModule: true, File: MockFile }
})

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

/**
 * A spot already acked by the server, with one photo still waiting behind it.
 *
 * `isHostAcked` (mediaDrain.ts) only attempts a photo whose host row reads
 * `synced`, so `markSynced` here is what makes the photo eligible at all — the
 * whole point of these tests is that nothing ELSE in the cycle should be able to
 * hold it back.
 */
async function seedSyncedSpotWithWaitingPhoto(database: Database, id: string): Promise<void> {
  const spot = await seedSpot(database, { uuid: `${id}-host` })
  await markSynced(database, spot)
  await database.write(async () =>
    database.get<PendingMedia>('pending_media').create((row: any) => {
      row._raw.id = id
      row._raw.host_type = 'stourify_spot'
      row._raw.host_uuid = `${id}-host`
      row._raw.local_path = `file:///document-dir/media-outbox/${id}.jpg`
      row._raw.filename = `${id}.jpg`
      row._raw.mime = 'image/jpeg'
      row._raw.size = 1
      row._raw.state = 'pending'
      row._raw.attempts = 0
      row._raw.created_at = Date.now()
    }),
  )
}

/**
 * Proof the photo was actually picked up and tried, not merely left alone.
 *
 * The module mock at the top of this file makes `requestUploadUrl` throw a `500`
 * — a real server answer, not a dropped radio — so a photo that WAS attempted
 * lands in `failed` with its attempt counted. A photo that was never reached
 * stays `pending` at zero attempts, which is exactly the bug this card fixes and
 * is indistinguishable from success unless you assert on it.
 */
async function expectPhotoWasAttempted(database: Database, id: string): Promise<void> {
  expect(requestUploadUrl).toHaveBeenCalledTimes(1)
  const row = await database.get<PendingMedia>('pending_media').find(id)
  expect(row.state).toBe('failed')
  expect(row.attempts).toBe(1)
}

const marker = Symbol.for('offline-sync-core.networkFailure')

function networkError(): Error {
  const error = new Error('Network request failed')
  Object.defineProperty(error, marker, { value: true, enumerable: false, configurable: true })
  return error
}

beforeEach(async () => {
  resetSyncStatus()
  // `requestUploadUrl` is a module-level mock shared by every test in this file,
  // and several below count its calls. Clearing only resets the call log; the
  // throwing implementation from the factory above survives.
  jest.clearAllMocks()
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
      results: [
        {
          table: 'sto_spots',
          uuid: 'spot-local-edit',
          op: 'updated',
          status: 'rejected',
          reason: 'validation',
          errors: { title: ['nope'] },
        },
      ],
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

  const outcome = await runSyncCycle({
    database,
    client: { get, post } as any,
    trigger: 'connectivity',
  })

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
      results: [
        {
          table: 'sto_spots',
          uuid: 'spot-status',
          op: 'created',
          status: 'rejected',
          reason: 'validation',
          errors: { title: ['too short'] },
        },
      ],
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
    client: {
      get: jest.fn(async () => ({ data: { server_time: 'now' } })),
      post: jest.fn(),
    } as any,
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
    runSyncCycle({
      database,
      client: { get: jest.fn(), post: jest.fn() } as any,
      trigger: 'manual',
    }),
  ).rejects.toThrow('boom: local read failed')

  expect(isSyncInFlight()).toBe(false)
  expect(useSyncStatusStore.getState().phase).toBe('idle')

  jest.spyOn(database, 'get').mockRestore()

  // A subsequent cycle must be able to start — the mutex was not left held.
  const get = jest.fn(async () => ({ data: { server_time: 'now' } }))
  const outcome = await runSyncCycle({
    database,
    client: { get, post: jest.fn() } as any,
    trigger: 'manual',
  })
  expect(outcome.skipped).toBeNull()
  expect(get).toHaveBeenCalledTimes(1)
})

it('an empty outbox with an offline pull leaves lastError untouched — only offline flips', async () => {
  const database = createTestDatabase()
  // No seeded rows: `drainOutbox` returns `fullyAcked: true` on an empty
  // outbox (pushService.ts:431-441), so the cycle proceeds past the gate and
  // into the pull — which is where this scenario differs from a dirty outbox.
  useSyncStatusStore.getState().setLastError('stale error from a previous cycle')

  const marker = Symbol.for('offline-sync-core.networkFailure')
  const get = jest.fn(async () => {
    const error = new Error('Network request failed')
    Object.defineProperty(error, marker, { value: true, enumerable: false, configurable: true })
    throw error
  })
  const post = jest.fn()

  const outcome = await runSyncCycle({
    database,
    client: { get, post } as any,
    trigger: 'connectivity',
  })

  expect(post).not.toHaveBeenCalled()
  expect(get).toHaveBeenCalledTimes(1)
  expect(outcome.pulled).toBe(false)
  expect(useSyncStatusStore.getState().offline).toBe(true)
  // A bare network failure must never surface as a user-visible error — it
  // must leave whatever `lastError` already held alone, exactly like the
  // symmetric drain-side branch at cycle.ts:90 already does.
  expect(useSyncStatusStore.getState().lastError).toBe('stale error from a previous cycle')
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

  await runSyncCycle({
    database,
    client: { get: jest.fn(), post: failingPost } as any,
    trigger: 'connectivity',
  })
  expect(useSyncStatusStore.getState().offline).toBe(true)

  // Cycle 2: the POST itself succeeds (proof of connectivity) but the row it
  // carries is rejected for a non-network reason — the gate still trips and
  // the pull is skipped, but `offline` must not stay stuck at `true`.
  const post2 = jest.fn(async () => ({
    data: {
      results: [
        {
          table: 'sto_spots',
          uuid: 'spot-flaky',
          op: 'created',
          status: 'rejected',
          reason: 'validation',
          errors: {},
        },
      ],
      server_time: 'now',
    },
  }))
  const get2 = jest.fn()

  const outcome = await runSyncCycle({
    database,
    client: { get: get2, post: post2 } as any,
    trigger: 'manual',
  })

  expect(post2).toHaveBeenCalledTimes(1)
  expect(get2).not.toHaveBeenCalled()
  expect(outcome.pulled).toBe(false)
  expect(useSyncStatusStore.getState().offline).toBe(false)
})

it('a stuck upload never gates the pull — phase 2 runs after the pull and is not part of fullyAcked', async () => {
  const database = createTestDatabase()
  const spot = await seedSpot(database, { uuid: 'spot-media-host' })
  await markSynced(database, spot)
  await database.write(async () =>
    database.get<PendingMedia>('pending_media').create((row: any) => {
      row._raw.id = 'media-stuck'
      row._raw.host_type = 'stourify_spot'
      row._raw.host_uuid = 'spot-media-host'
      row._raw.local_path = 'file:///document-dir/media-outbox/media-stuck.jpg'
      row._raw.filename = 'stuck.jpg'
      row._raw.mime = 'image/jpeg'
      row._raw.size = 1
      row._raw.state = 'pending'
      row._raw.attempts = 0
      row._raw.created_at = Date.now()
    }),
  )

  const get = jest.fn(async () => ({ data: { server_time: 'now' } }))
  const post = jest.fn()

  const outcome = await runSyncCycle({ database, client: { get, post } as any, trigger: 'manual' })

  expect(post).not.toHaveBeenCalled()
  expect(get).toHaveBeenCalledTimes(1)
  expect(outcome.drain.fullyAcked).toBe(true)
  expect(outcome.pulled).toBe(true)

  // The stuck media row is still there — its own failure, tracked separately.
  const row = await database.get<PendingMedia>('pending_media').find('media-stuck')
  expect(row.state === 'pending' || row.state === 'failed').toBe(true)
})

/**
 * STOURIFY-29. The rule the four tests below enforce, in one sentence: **the only
 * thing allowed to hold a photo back is its own host row not being on the server
 * yet.**
 *
 * Design spec §2.3 rule 3 guards the opposite direction — a stuck photo must
 * never delay incoming data — and the test above covers it. Nobody ever wrote
 * down the converse, so the code arrived at it by accident: every early return
 * in `runSyncCycle` jumped straight over the photo phase. A server returning
 * `500` on the delta endpoint therefore held a user's photos for as long as it
 * kept failing, with nothing on screen saying so.
 */
it('STOURIFY-29: a pull that fails with a real server error does not hold the photo queue', async () => {
  const database = createTestDatabase()
  await seedSyncedSpotWithWaitingPhoto(database, 'media-pull-500')

  // The exact shape of the reported incident: the delta endpoint answers, and
  // what it answers is an error.
  const get = jest.fn(async () => {
    throw new Error('Request failed with status code 500')
  })

  const outcome = await runSyncCycle({
    database,
    client: { get, post: jest.fn() } as any,
    trigger: 'connectivity',
  })

  expect(get).toHaveBeenCalledTimes(1)
  expect(outcome.pulled).toBe(false)
  expect(outcome.error).not.toBeNull()
  await expectPhotoWasAttempted(database, 'media-pull-500')
})

it('STOURIFY-29: a pull that fails on a dropped radio does not hold the photo queue', async () => {
  const database = createTestDatabase()
  await seedSyncedSpotWithWaitingPhoto(database, 'media-pull-offline')

  const get = jest.fn(async () => {
    throw networkError()
  })

  const outcome = await runSyncCycle({
    database,
    client: { get, post: jest.fn() } as any,
    trigger: 'connectivity',
  })

  expect(outcome.pulled).toBe(false)
  expect(useSyncStatusStore.getState().offline).toBe(true)
  // Cheap rather than pointless: the photo phase runs, discovers the same dead
  // network, and costs one request. It must not be skipped on the guess that
  // there is no connectivity, because a pull can fail for reasons that have
  // nothing to do with the radio.
  await expectPhotoWasAttempted(database, 'media-pull-offline')
})

it('STOURIFY-29: one rejected row in the outbox does not hold the photo queue either', async () => {
  const database = createTestDatabase()
  await seedSyncedSpotWithWaitingPhoto(database, 'media-gate-trip')
  // A second, unrelated spot the server refuses. It trips the gate, so the pull
  // is never attempted at all — a longer stall than a broken server, because it
  // waits on a human resolving the rejection.
  await seedSpot(database, { uuid: 'spot-rejected' })

  const get = jest.fn()
  const post = jest.fn(async () => ({
    data: {
      results: [
        {
          table: 'sto_spots',
          uuid: 'spot-rejected',
          op: 'created',
          status: 'rejected',
          reason: 'validation',
          errors: {},
        },
      ],
      server_time: 'now',
    },
  }))

  const outcome = await runSyncCycle({ database, client: { get, post } as any, trigger: 'manual' })

  expect(outcome.drain.fullyAcked).toBe(false)
  expect(get).not.toHaveBeenCalled()
  await expectPhotoWasAttempted(database, 'media-gate-trip')
})

it('STOURIFY-29: the photo phase never changes what the cycle reports', async () => {
  const database = createTestDatabase()
  await seedSyncedSpotWithWaitingPhoto(database, 'media-quiet')

  const get = jest.fn(async () => ({ data: { server_time: 'now' } }))
  const outcome = await runSyncCycle({
    database,
    client: { get, post: jest.fn() } as any,
    trigger: 'manual',
  })

  // The photo failed with a `500`, and the cycle still reports a clean pull.
  // Photo trouble surfaces on the Sync Status screen through the media counters,
  // never as this cycle's `error`.
  expect(outcome.pulled).toBe(true)
  expect(outcome.error).toBeNull()
  await expectPhotoWasAttempted(database, 'media-quiet')
  expect(useSyncStatusStore.getState().mediaFailures).toHaveLength(1)
  expect(useSyncStatusStore.getState().pendingMediaCount).toBe(0)
})

/**
 * STOURIFY-161. The send-later queue for posts sits beside the photo queue, in
 * the same `finally`, for the same reason: nothing above it may hold it back.
 *
 * The two tests below are the pair that matters. The first says a queued post
 * is sent even when the pull failed outright; the second says the attempt can
 * never change what the cycle reports, in either direction.
 */
describe('the send-later post queue runs whatever else the cycle did', () => {
  async function seedQueuedPost(database: Database, caption: string): Promise<void> {
    await database.write(async () =>
      database.get('post_outbox').create((row: any) => {
        row._raw.caption = caption
        row._raw.visibility = 'public'
        row._raw.media = '[]'
        row._raw.post_uuid = null
        row._raw.state = 'queued'
        row._raw.attempts = 0
        row._raw.created_at = Date.now()
      }),
    )
  }

  it('sends a queued post even when the pull failed outright', async () => {
    const database = createTestDatabase()
    await seedQueuedPost(database, 'queued while the delta endpoint was broken')

    const get = jest.fn(async () => {
      throw new Error('Request failed with status code 500')
    })

    const outcome = await runSyncCycle({
      database,
      client: { get, post: jest.fn() } as any,
      trigger: 'connectivity',
    })

    expect(outcome.pulled).toBe(false)
    // The post's own create call is the app's shared client, not this one, so
    // it fails here too — what matters is that the entry was picked up at all.
    // A drain that never ran would leave `attempts` at zero and `state` queued;
    // a drain that ran against a broken server marks it failed.
    const [row] = await database.get('post_outbox').query().fetch()
    expect((row as any).state).toBe('failed')
  })

  it('never changes what the cycle reports', async () => {
    const database = createTestDatabase()
    await seedQueuedPost(database, 'queued while everything else was fine')

    const get = jest.fn(async () => ({ data: { server_time: 'now' } }))
    const outcome = await runSyncCycle({
      database,
      client: { get, post: jest.fn() } as any,
      trigger: 'manual',
    })

    // The post could not be sent — there is no real server behind the shared
    // client in this suite — and the cycle still reports a clean pull.
    expect(outcome.pulled).toBe(true)
    expect(outcome.error).toBeNull()
  })
})

/**
 * The trace exists for one reason: STOURIFY-134 measured a reconnect on real
 * hardware where the app knew it was back online and sent nothing at all for a
 * minute. Silence is the symptom, and silence is what every one of this
 * function's six exits looks like from outside.
 *
 * So what is asserted here is not "a log line appeared". It is the two
 * properties that make the log usable at three in the morning with one rare
 * failure in front of you:
 *
 *   1. Every cycle that starts also ends, and both lines carry the same number,
 *      so a cycle that never came back is visible as an opening with no close.
 *   2. A cycle that is turned away says WHO turned it away and HOW LONG that
 *      holder has been sitting there. That number is the whole hypothesis: a
 *      cycle left over from the offline period, still waiting on a socket that
 *      will never answer, shows up as a large `held=`.
 */
describe('the sync cycle trace', () => {
  const original = process.env.EXPO_PUBLIC_SYNC_TRACE
  let spy: jest.SpyInstance

  const lines = (): string[] => spy.mock.calls.map((call) => String(call[0]))

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SYNC_TRACE = '1'
    spy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    spy.mockRestore()
    if (original === undefined) delete process.env.EXPO_PUBLIC_SYNC_TRACE
    else process.env.EXPO_PUBLIC_SYNC_TRACE = original
  })

  it('opens and closes exactly once per cycle, with the same cycle number', async () => {
    const database = createTestDatabase()

    await runSyncCycle({
      database,
      client: {
        get: jest.fn(async () => ({ data: { server_time: 'now' } })),
        post: jest.fn(),
      } as any,
      trigger: 'connectivity',
    })

    const enters = lines().filter((line) => / enter /.test(line))
    const ends = lines().filter((line) => / end /.test(line))

    expect(enters).toHaveLength(1)
    expect(ends).toHaveLength(1)
    expect(enters[0]).toContain('trigger=connectivity')

    const number = /cycle#(\d+) enter/.exec(enters[0])?.[1]
    expect(number).toBeDefined()
    expect(ends[0]).toContain(`cycle#${number} end`)
  })

  it('reports every phase boundary it crossed, in order', async () => {
    const database = createTestDatabase()

    await runSyncCycle({
      database,
      client: {
        get: jest.fn(async () => ({ data: { server_time: 'now' } })),
        post: jest.fn(),
      } as any,
      trigger: 'manual',
    })

    const joined = lines().join('\n')
    for (const phase of ['drain', 'pull', 'media', 'post-outbox']) {
      expect(joined).toContain(`${phase} start`)
      expect(joined).toContain(`${phase} done`)
    }
  })

  it('names the holder and its age when a cycle is turned away', async () => {
    const database = createTestDatabase()

    const get = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
      return { data: { server_time: 'now' } }
    })

    const client = { get, post: jest.fn() } as any
    await Promise.all([
      runSyncCycle({ database, client, trigger: 'foreground' }),
      runSyncCycle({ database, client, trigger: 'connectivity' }),
    ])

    const skips = lines().filter((line) => / skip /.test(line))
    expect(skips).toHaveLength(1)
    expect(skips[0]).toContain('reason=in-flight')
    expect(skips[0]).toContain('trigger=connectivity')
    expect(skips[0]).toContain('holder=foreground')
    expect(skips[0]).toMatch(/held=\d+ms/)
  })

  it('says the cycle finished even when the pull threw', async () => {
    const database = createTestDatabase()

    await runSyncCycle({
      database,
      client: {
        get: jest.fn(async () => {
          throw new Error('the delta endpoint fell over')
        }),
        post: jest.fn(),
      } as any,
      trigger: 'login',
    })

    const joined = lines().join('\n')
    expect(joined).toContain('pull start')
    expect(joined).toMatch(/cycle#\d+ end/)
  })
})

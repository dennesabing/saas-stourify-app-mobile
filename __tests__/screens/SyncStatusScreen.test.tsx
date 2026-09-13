import type { Database } from '@nozbe/watermelondb'
import { Alert } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type PendingMedia from '@/db/models/PendingMedia'
import type Spot from '@/db/models/Spot'
import { createLocalReview } from '@/features/reviews/api/createLocalReview'
import SyncStatusScreen from '@/features/sync/screens/SyncStatusScreen'
import type { SyncTrigger } from '@/sync/cycle'
import { upsertSyncFailure } from '@/sync/pushService'
import { resetSyncStatus, useSyncStatusStore } from '@/sync/status'
import { syncNow } from '@/sync/scheduler'
import { resetSyncOnOpen } from '@/sync/openTrigger'
import { createTestDatabase, markSynced, seedSpot } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/sync/scheduler', () => ({ syncNow: jest.fn(async () => undefined) }))

const mockFileRegistry = new Map<string, boolean>()
const fsDeletes: string[] = []

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string
    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }
    get exists() {
      return mockFileRegistry.get(this.uri) ?? true
    }
    delete() {
      mockFileRegistry.set(this.uri, false)
      fsDeletes.push(this.uri)
    }
  }
  return { __esModule: true, File: MockFile }
})

async function seedPendingMedia(
  database: Database,
  overrides: Partial<{
    id: string
    filename: string
    state: string
    attempts: number
    lastError: string | null
    localPath: string
  }> = {},
): Promise<PendingMedia> {
  const seed = {
    id: 'media-1',
    filename: 'beach.jpg',
    state: 'pending',
    attempts: 0,
    lastError: null as string | null,
    localPath: 'file:///document-dir/media-outbox/media-1.jpg',
    ...overrides,
  }

  return database.write(async () =>
    database.get<PendingMedia>('pending_media').create((row: any) => {
      row._raw.id = seed.id
      row._raw.host_type = 'stourify_spot'
      row._raw.host_uuid = 'spot-uuid-1'
      row._raw.local_path = seed.localPath
      row._raw.filename = seed.filename
      row._raw.mime = 'image/jpeg'
      row._raw.size = 100
      row._raw.state = seed.state
      row._raw.attempts = seed.attempts
      row._raw.last_error = seed.lastError
      row._raw.created_at = Date.now()
    }),
  )
}

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

/** Resolves the moment the screen asks the (mocked) scheduler for a `trigger` cycle. */
function whenSyncRequested(trigger: SyncTrigger): Promise<void> {
  return new Promise((resolve) => {
    jest.mocked(syncNow).mockImplementation(async (_database, requested) => {
      if (requested === trigger) resolve()
      return undefined as never
    })
  })
}

/**
 * Presses a control, then waits until the press has FINISHED — on the handler's
 * own last step, never on a clock (STOURIFY-258).
 *
 * A relay race: "delete the row" hands over to "re-read the lists", which hands
 * over to "draw them". These tests used to start `waitFor`'s one-second
 * stopwatch at the press and hope all three legs ran inside it. They take about
 * five milliseconds — but a jest worker starved by a full parallel run can
 * freeze for longer than a second, and that stopwatch is a real `setTimeout`
 * that keeps running while the worker is frozen.
 *
 * So wait for the finish line instead. Every handler on this screen asks for a
 * sync cycle as its LAST step, after its write has committed. Then one read of
 * our own: the database answers one request at a time, in the order asked, and
 * the screen asked for its fresh lists the moment the write landed — so when
 * this read returns, the screen has its answers too, and `act` draws them.
 * Nothing here is timed. If a handler never gets that far, jest's own per-test
 * limit reports the test by name.
 */
async function pressAndSettle(
  database: Database,
  target: Parameters<typeof fireEvent.press>[0],
): Promise<void> {
  const requested = whenSyncRequested('manual')
  fireEvent.press(target)
  await act(async () => {
    await requested
    await database.get('sync_failures').query().fetchCount()
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  // `clearAllMocks` keeps implementations, and `whenSyncRequested` swaps one in.
  jest.mocked(syncNow).mockImplementation(async () => undefined as never)
  resetSyncStatus()
  // The open-on-mount cooling-off window is module-level state, so without
  // this every test after the first would render inside the previous test's
  // window and see no cycle at all.
  resetSyncOnOpen()
  mockFileRegistry.clear()
  fsDeletes.length = 0
})

it('shows an offline write in the queue with no sync cycle having run', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  // The store still reports zero — nothing has published queue state, because
  // no cycle has run. The screen must read the database, not the store.
  expect(useSyncStatusStore.getState().pendingCount).toBe(0)

  await waitFor(() => {
    expect(screen.getByText('New spot · Hidden Cove')).toBeTruthy()
    expect(screen.getByText('Pending uploads')).toBeTruthy()
    expect(screen.getByText('1 change waiting to sync')).toBeTruthy()
  })
})

/**
 * Artboard 2 of the Offline & Sync design, with the work the card's live run
 * makes: a new spot, a review on another spot, and a save of a third
 * (STOURIFY-294). Each row reads as what the person did, carries a Queued
 * pill, and the banner leads with the count even with the radio off.
 */
it('lists offline work the way the design draws it', async () => {
  const database = createTestDatabase()
  useSyncStatusStore.getState().setOffline(true)
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })
  const reviewed = await seedSpot(database, { uuid: 'spot-2', title: 'Tuna Corner Grill' })
  await markSynced(database, reviewed)
  await createLocalReview(database, { spotId: null, spotUuid: 'spot-2', rating: 5, body: 'Yes.' })
  await database.write(async () =>
    database.get('sto_wishlist_items').create((row: any) => {
      row._raw.id = 'save-1'
      row._raw.uuid = 'save-1'
      row._raw.spot_id = null
      row._raw.spot_uuid = 'spot-3'
      row._raw.is_downloaded_offline = false
      row._raw.spot_snapshot = JSON.stringify({
        uuid: 'spot-3',
        title: 'Sunset Ridge Overlook',
        categories: [],
        address: null,
        thumb_url: null,
      })
      row._raw.created_at = 1
      row._raw.updated_at = 1
    }),
  )

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('3 changes waiting to sync')).toBeTruthy()
    expect(screen.getByText('New spot · Hidden Cove')).toBeTruthy()
    expect(screen.getByText('Review · Tuna Corner Grill')).toBeTruthy()
    expect(screen.getByText('Saved · Sunset Ridge Overlook')).toBeTruthy()
  })
  expect(screen.getByText("You're offline · not synced yet")).toBeTruthy()
  expect(screen.getAllByTestId('sync-row-queued')).toHaveLength(3)
  expect(screen.getByRole('button', { name: 'Retry all now' })).toBeTruthy()
})

it('shows a rejection with the server error and both actions', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1',
    tableName: 'sto_spots',
    reason: 'validation',
    lastError: JSON.stringify({ title: ['The title field is required.'] }),
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('Needs your attention')).toBeTruthy()
    expect(screen.getByText('Rejected: The title field is required. · 1 attempt')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
    expect(screen.getByText('Discard')).toBeTruthy()
  })
})

it('retrying a row clears its failure and runs a cycle', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1',
    tableName: 'sto_spots',
    reason: 'validation',
    lastError: '{}',
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('Needs your attention')).toBeTruthy())
  await pressAndSettle(database, screen.getByText('Retry'))

  expect(syncNow).toHaveBeenCalledWith(database, 'manual')
  expect(await database.get('sync_failures').query().fetchCount()).toBe(0)
  expect(screen.queryByText('Needs your attention')).toBeNull()
})

it('discarding asks first, then destroys the row permanently', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1',
    tableName: 'sto_spots',
    reason: 'validation',
    lastError: '{}',
  })

  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const discard = (buttons ?? []).find((button) => button.text === 'Discard')
    void discard?.onPress?.()
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('Discard')).toBeTruthy())
  await pressAndSettle(database, screen.getByText('Discard'))

  expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
  expect(alertSpy).toHaveBeenCalled()
  expect(await database.adapter.getDeletedRecords('sto_spots')).toHaveLength(0)

  alertSpy.mockRestore()
})

it('retry all clears every failure and runs a cycle', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1',
    tableName: 'sto_spots',
    reason: 'validation',
    lastError: '{}',
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  // The failure has to be on screen first, or "gone" afterwards proves nothing.
  await waitFor(() => expect(screen.getByText('Needs your attention')).toBeTruthy())
  const retryAll = screen.getByRole('button', { name: 'Retry all now' })
  // Inert while a cycle runs (`phase !== 'idle'`), and a press on it then does nothing.
  expect(retryAll).toBeEnabled()
  await pressAndSettle(database, retryAll)

  expect(syncNow).toHaveBeenCalledWith(database, 'manual')
  expect(await database.get('sync_failures').query().fetchCount()).toBe(0)
  expect(screen.queryByText('Needs your attention')).toBeNull()
})

it('hides retry-all when there is nothing queued', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('Everything is synced')).toBeTruthy())
  expect(screen.queryByText('Retry all now')).toBeNull()
})

/**
 * The banner is the synced state now (STOURIFY-294). It used to say "All
 * changes synced" with a second "Everything is synced" card under it — two
 * sentences for one fact.
 */
it('says it once when the queue is clean', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('Everything is synced')).toBeTruthy())
  expect(screen.queryByText('All changes synced')).toBeNull()
  expect(screen.queryByText('Pending uploads')).toBeNull()
})

/**
 * STOURIFY-303, found on the emulator. When the server acknowledges a delete,
 * the phone destroys its removal mark straight through the adapter
 * (`applyPushResults`), and that tells nobody. So the open screen kept
 * "Removed a saved spot · Waiting to send" under "Last synced just now" until
 * you left it and came back. The cycle publishing its result is the signal the
 * screen was missing.
 */
it('drops a delete from the queue once the cycle reports it was sent', async () => {
  const database = createTestDatabase()
  const save = await database.write(async () =>
    database.get('sto_wishlist_items').create((row: any) => {
      row._raw.id = 'save-1'
      row._raw.uuid = 'save-1'
      row._raw.spot_uuid = 'spot-1'
      row._raw.is_downloaded_offline = false
      row._raw.created_at = 1
      row._raw.updated_at = 1
    }),
  )
  await markSynced(database, save)
  await database.write(async () => {
    await save.markAsDeleted()
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
  await waitFor(() => expect(screen.getByText('Removed a saved spot')).toBeTruthy())

  // The acknowledgement exactly as `applyPushResults` applies it, then the
  // cycle publishing what is left (`publishQueueState` in cycle.ts).
  await act(async () => {
    await database.adapter.destroyDeletedRecords('sto_wishlist_items', ['save-1'])
    useSyncStatusStore.getState().setPendingCount(0)
  })

  await waitFor(() => expect(screen.getByText('Everything is synced')).toBeTruthy())
  expect(screen.queryByText('Removed a saved spot')).toBeNull()
})

it('lists a pending photo under Pending uploads, beside the other waiting work', async () => {
  const database = createTestDatabase()
  await seedPendingMedia(database, { filename: 'beach.jpg' })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('Pending uploads')).toBeTruthy()
    expect(screen.getByText('Photo · beach.jpg')).toBeTruthy()
  })
  expect(screen.queryByText('Photos')).toBeNull()
})

it('discarding a photo deletes the local file as well as the row', async () => {
  const database = createTestDatabase()
  await seedPendingMedia(database, {
    filename: 'cove.png',
    state: 'failed',
    attempts: 1,
    lastError: 'The file exceeds the maximum size.',
    localPath: 'file:///document-dir/media-outbox/media-1.jpg',
  })

  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const discard = (buttons ?? []).find((button) => button.text === 'Discard')
    void discard?.onPress?.()
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('Photo · cove.png')).toBeTruthy())
  await pressAndSettle(database, screen.getByLabelText('Discard Photo · cove.png'))

  expect(fsDeletes).toContain('file:///document-dir/media-outbox/media-1.jpg')
  await expect(database.get<PendingMedia>('pending_media').find('media-1')).rejects.toThrow()

  alertSpy.mockRestore()
})

it('retrying a failed photo resets it to pending and runs a cycle', async () => {
  const database = createTestDatabase()
  await seedPendingMedia(database, {
    filename: 'cove.png',
    state: 'failed',
    attempts: 1,
    lastError: 'boom',
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByLabelText('Retry Photo · cove.png')).toBeTruthy())
  await pressAndSettle(database, screen.getByLabelText('Retry Photo · cove.png'))

  const row = await database.get<PendingMedia>('pending_media').find('media-1')
  expect(row.state).toBe('pending')
  expect(syncNow).toHaveBeenCalledWith(database, 'manual')
})

/**
 * Not "goes back to Settings": since STOURIFY-118 this screen is opened from
 * the Create menu as well, so the button returns to whichever screen sent you.
 * It is the design's round back button now (STOURIFY-294), which says "Back"
 * everywhere it appears — still no destination named.
 */
it('goes back to wherever it was opened from', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  fireEvent.press(screen.getByLabelText('Back'))
  expect(navigation.goBack).toHaveBeenCalled()
})

/**
 * STOURIFY-161. A post pressed Share on with no signal waits here. Since
 * STOURIFY-294 it waits in the one Pending uploads list, beside everything
 * else that is on its way, rather than in a section of its own.
 */
async function seedQueuedPost(
  database: Database,
  overrides: Partial<{
    id: string
    caption: string
    state: string
    attempts: number
    lastError: string | null
    mediaUri: string | null
    spotTitle: string | null
  }> = {},
): Promise<void> {
  const seed = {
    id: 'outbox-1',
    caption: 'Written in a tunnel',
    state: 'queued',
    attempts: 0,
    lastError: null as string | null,
    mediaUri: 'file:///document-dir/post-drafts/outbox-1-0.jpg' as string | null,
    spotTitle: null as string | null,
    ...overrides,
  }

  await database.write(async () =>
    database.get('post_outbox').create((row: any) => {
      row._raw.id = seed.id
      row._raw.caption = seed.caption
      row._raw.visibility = 'public'
      row._raw.media =
        seed.mediaUri === null ? '[]' : JSON.stringify([{ uri: seed.mediaUri, fileName: 'a.jpg' }])
      row._raw.post_uuid = null
      row._raw.spot_title = seed.spotTitle
      row._raw.state = seed.state
      row._raw.attempts = seed.attempts
      row._raw.last_error = seed.lastError
      row._raw.created_at = Date.now()
    }),
  )
}

it('shows a post waiting for a signal under Pending uploads', async () => {
  const database = createTestDatabase()
  await seedQueuedPost(database, { caption: 'Written in a tunnel', spotTitle: 'Hidden Cove' })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('Pending uploads')).toBeTruthy()
    expect(screen.getByText('New post · Written in a tunnel')).toBeTruthy()
    expect(screen.getByText('Hidden Cove · waiting for a signal')).toBeTruthy()
  })
  expect(screen.queryByText('Posts')).toBeNull()
})

it('names a post with no caption by something other than nothing', async () => {
  const database = createTestDatabase()
  await seedQueuedPost(database, { caption: '' })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('New post')).toBeTruthy())
})

it('retrying a refused post puts it back in the queue and runs a cycle', async () => {
  const database = createTestDatabase()
  await seedQueuedPost(database, {
    caption: 'Refused',
    state: 'failed',
    attempts: 2,
    lastError: 'The caption is too long.',
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByLabelText('Retry New post · Refused')).toBeTruthy())
  await pressAndSettle(database, screen.getByLabelText('Retry New post · Refused'))

  const row: any = await database.get('post_outbox').find('outbox-1')
  expect(row.state).toBe('queued')
  expect(syncNow).toHaveBeenCalledWith(database, 'manual')
})

it('discarding a queued post deletes its photo copies as well as the row', async () => {
  const database = createTestDatabase()
  await seedQueuedPost(database, {
    caption: 'Never mind',
    state: 'failed',
    attempts: 1,
    lastError: 'The server refused this post.',
    mediaUri: 'file:///document-dir/post-drafts/outbox-1-0.jpg',
  })

  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const discard = (buttons ?? []).find((button) => button.text === 'Discard')
    void discard?.onPress?.()
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('New post · Never mind')).toBeTruthy())
  await pressAndSettle(database, screen.getByLabelText('Discard New post · Never mind'))

  expect(fsDeletes).toContain('file:///document-dir/post-drafts/outbox-1-0.jpg')
  await expect(database.get('post_outbox').find('outbox-1')).rejects.toThrow()

  alertSpy.mockRestore()
})

/**
 * The banner is the first thing on this screen, and it used to say "Nothing
 * waiting to send" directly above a post that was (STOURIFY-161). Found on a
 * real emulator, which is the only place the two are visible together.
 */
it('does not claim nothing is waiting while a post is', async () => {
  const database = createTestDatabase()
  useSyncStatusStore.getState().setOffline(true)
  await seedQueuedPost(database, { caption: 'Written in a tunnel' })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('1 change waiting to sync')).toBeTruthy()
  })
  expect(screen.queryByText('Nothing waiting to send')).toBeNull()
  expect(screen.queryByText('Everything is synced')).toBeNull()
})

/**
 * A queued post can be cancelled before it goes out (STOURIFY-161). Every other
 * waiting row deliberately cannot — see `SyncQueueRow`'s note — because a post
 * is a publication rather than a record, and it is never going to fail; it is
 * going to send.
 */
it('lets you throw away a post that is still waiting, before it goes out', async () => {
  const database = createTestDatabase()
  await seedQueuedPost(database, {
    caption: 'Second thoughts',
    mediaUri: 'file:///document-dir/post-drafts/outbox-1-0.jpg',
  })

  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const discard = (buttons ?? []).find((button) => button.text === 'Discard')
    void discard?.onPress?.()
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() =>
    expect(screen.getByLabelText('Discard New post · Second thoughts')).toBeTruthy(),
  )
  await pressAndSettle(database, screen.getByLabelText('Discard New post · Second thoughts'))

  expect(fsDeletes).toContain('file:///document-dir/post-drafts/outbox-1-0.jpg')
  await expect(database.get('post_outbox').find('outbox-1')).rejects.toThrow()

  alertSpy.mockRestore()
})

/** A queued spot or photo still offers no way out, and that has not changed. */
it('still offers no discard on a waiting photo', async () => {
  const database = createTestDatabase()
  await seedPendingMedia(database, { filename: 'beach.jpg' })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('Photo · beach.jpg')).toBeTruthy())
  expect(screen.queryByLabelText('Discard Photo · beach.jpg')).toBeNull()
})

/**
 * The banner counts exactly what the screen lists (STOURIFY-165).
 *
 * A till receipt that leaves items off: every line on it is true, and the total
 * is wrong — and the total is the line people read. With a photo queued and
 * nothing else the banner used to say "Nothing waiting to send", directly above
 * a Photos section showing that photo waiting.
 *
 * The same defect appeared for posts the moment posts could be queued, and
 * STOURIFY-161 fixed that instance. These cases pin the class: every list the
 * screen renders contributes to the total above it, so the seventh queue somebody
 * adds cannot quietly go uncounted.
 */
it('does not claim nothing is waiting while a photo is', async () => {
  const database = createTestDatabase()
  useSyncStatusStore.getState().setOffline(true)
  await seedPendingMedia(database)

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('1 change waiting to sync')).toBeTruthy()
  })
  expect(screen.queryByText('Nothing waiting to send')).toBeNull()
  expect(screen.queryByText('Everything is synced')).toBeNull()
})

it('counts a queued photo and a queued post together', async () => {
  const database = createTestDatabase()
  useSyncStatusStore.getState().setOffline(true)
  await seedPendingMedia(database)
  await seedQueuedPost(database, { caption: 'Written in a tunnel' })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('2 changes waiting to sync')).toBeTruthy()
  })
})

it('counts a failed photo among the failures', async () => {
  const database = createTestDatabase()
  await seedPendingMedia(database, {
    id: 'media-failed-1',
    state: 'failed',
    attempts: 3,
    lastError: 'Upload refused',
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('1 change needs a retry')).toBeTruthy()
  })
})

/*
  Opening the screen is itself a request to try again (STOURIFY-179).

  These two exercise the REAL cooling-off window in `@/sync/openTrigger`, which
  is deliberately not mocked here — only `@/sync/scheduler` underneath it is. If
  the window were mocked away with everything else, the second test would pass
  just as happily against an implementation that had no window at all.
*/

it('starts a sync cycle when the screen is opened, with no press', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(syncNow).toHaveBeenCalledWith(database, 'screen-open')
  })
  expect(syncNow).toHaveBeenCalledTimes(1)
})

it('does not start a second cycle when the screen is re-opened straight away', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })

  const first = render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
  await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1))

  // Going back pops the screen off the native stack, which unmounts it.
  first.unmount()

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
  await waitFor(() => expect(screen.getByText('Sync status')).toBeTruthy())

  expect(syncNow).toHaveBeenCalledTimes(1)
})

import type { Database } from '@nozbe/watermelondb'
import { Alert } from 'react-native'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type PendingMedia from '@/db/models/PendingMedia'
import type Spot from '@/db/models/Spot'
import SyncStatusScreen from '@/features/sync/screens/SyncStatusScreen'
import { upsertSyncFailure } from '@/sync/pushService'
import { resetSyncStatus, useSyncStatusStore } from '@/sync/status'
import { syncNow } from '@/sync/scheduler'
import { createTestDatabase, seedSpot } from '../support/testDatabase'
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

beforeEach(() => {
  jest.clearAllMocks()
  resetSyncStatus()
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

  await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy())
  fireEvent.press(screen.getByText('Retry'))

  await waitFor(() => {
    expect(screen.queryByText('Needs your attention')).toBeNull()
    expect(syncNow).toHaveBeenCalled()
  })
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
  fireEvent.press(screen.getByText('Discard'))

  await waitFor(async () => {
    expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
  })

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

  await waitFor(() => expect(screen.getByText('Retry all now')).toBeTruthy())
  fireEvent.press(screen.getByText('Retry all now'))

  await waitFor(() => {
    expect(screen.queryByText('Needs your attention')).toBeNull()
    expect(syncNow).toHaveBeenCalled()
  })
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

it('shows the empty state when the queue is clean', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('All changes synced')).toBeTruthy()
    expect(screen.getByText('Everything is synced')).toBeTruthy()
  })
})

it('shows a pending photo in its own Photos section', async () => {
  const database = createTestDatabase()
  await seedPendingMedia(database, { filename: 'beach.jpg' })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('Photos')).toBeTruthy()
    expect(screen.getByText('Photo · beach.jpg')).toBeTruthy()
  })
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
  fireEvent.press(screen.getByLabelText('Discard Photo · cove.png'))

  await waitFor(() => {
    expect(fsDeletes).toContain('file:///document-dir/media-outbox/media-1.jpg')
  })
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
  fireEvent.press(screen.getByLabelText('Retry Photo · cove.png'))

  await waitFor(async () => {
    const row = await database.get<PendingMedia>('pending_media').find('media-1')
    expect(row.state).toBe('pending')
  })
  expect(syncNow).toHaveBeenCalled()
})

/**
 * Not "goes back to Settings": since STOURIFY-118 this screen is opened from
 * the Create menu as well, so the button returns to whichever screen sent you.
 */
it('goes back to wherever it was opened from', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  fireEvent.press(screen.getByLabelText('Go back'))
  expect(navigation.goBack).toHaveBeenCalled()
})

/**
 * STOURIFY-161. A post pressed Share on with no signal waits here, in its own
 * section — the same arrangement photos have, and for the same reason: it is
 * not a row edit and never participates in the skip-pull gate.
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
  }> = {},
): Promise<void> {
  const seed = {
    id: 'outbox-1',
    caption: 'Written in a tunnel',
    state: 'queued',
    attempts: 0,
    lastError: null as string | null,
    mediaUri: 'file:///document-dir/post-drafts/outbox-1-0.jpg' as string | null,
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
      row._raw.state = seed.state
      row._raw.attempts = seed.attempts
      row._raw.last_error = seed.lastError
      row._raw.created_at = Date.now()
    }),
  )
}

it('shows a post waiting for a signal in its own Posts section', async () => {
  const database = createTestDatabase()
  await seedQueuedPost(database, { caption: 'Written in a tunnel' })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('Posts')).toBeTruthy()
    expect(screen.getByText('New post · Written in a tunnel')).toBeTruthy()
  })
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
  fireEvent.press(screen.getByLabelText('Retry New post · Refused'))

  await waitFor(async () => {
    const row: any = await database.get('post_outbox').find('outbox-1')
    expect(row.state).toBe('queued')
  })
  expect(syncNow).toHaveBeenCalled()
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
  fireEvent.press(screen.getByLabelText('Discard New post · Never mind'))

  await waitFor(() => {
    expect(fsDeletes).toContain('file:///document-dir/post-drafts/outbox-1-0.jpg')
  })
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
    expect(screen.getByText("1 change waiting · they'll send when you reconnect")).toBeTruthy()
  })
  expect(screen.queryByText('Nothing waiting to send')).toBeNull()
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
  fireEvent.press(screen.getByLabelText('Discard New post · Second thoughts'))

  await waitFor(() => {
    expect(fsDeletes).toContain('file:///document-dir/post-drafts/outbox-1-0.jpg')
  })
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

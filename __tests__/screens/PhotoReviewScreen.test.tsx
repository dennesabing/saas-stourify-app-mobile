import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Database } from '@nozbe/watermelondb'
import type PendingMedia from '@/db/models/PendingMedia'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

/** Recording filesystem stand-in — see `__tests__/features/media/draftMedia.test.ts`. */
const fsCalls: { copies: { from: string; to: string }[]; deletes: string[] } = {
  copies: [],
  deletes: [],
}

jest.mock('expo-file-system', () => {
  const present = new Set<string>()

  class MockFile {
    uri: string
    size = 4096

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    get exists(): boolean {
      return present.has(this.uri)
    }

    copy(destination: { uri: string }) {
      fsCalls.copies.push({ from: this.uri, to: destination.uri })
      present.add(destination.uri)
    }

    delete() {
      fsCalls.deletes.push(this.uri)
      present.delete(this.uri)
    }
  }

  class MockDirectory {
    uri: string

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    create() {}
  }

  return {
    __esModule: true,
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///document-dir' } },
  }
})

import { queueCapturedPhoto } from '@/features/media/api/draftMedia'
import PhotoReviewScreen from '@/features/media/screens/PhotoReviewScreen'

const navigation = { navigate: jest.fn(), goBack: jest.fn(), popTo: jest.fn() } as any

/**
 * Deliberately `undefined`, and asserted on rather than assumed: the review
 * step must render from the database. A route payload here would be a camera
 * cache URI held in navigation state, which is exactly what design-spec §2.3
 * rule 4 forbids.
 */
const route = { params: undefined } as any

let database: Database

beforeEach(() => {
  jest.clearAllMocks()
  database = createTestDatabase()
  fsCalls.copies = []
  fsCalls.deletes = []
})

function renderScreen() {
  return render(
    <TestProviders database={database}>
      <PhotoReviewScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

async function seedDraft(filename: string): Promise<string> {
  return queueCapturedPhoto(database, {
    uri: `file:///cache/Camera/${filename}`,
    filename,
    mime: 'image/jpeg',
  })
}

it('renders the captured photos from the database, with no media in its route params', async () => {
  await seedDraft('one.jpg')
  await seedDraft('two.jpg')

  renderScreen()

  await waitFor(() => expect(screen.getByLabelText('Remove one.jpg')).toBeTruthy())
  expect(screen.getByLabelText('Remove two.jpg')).toBeTruthy()
  expect(screen.getByText('2 of 3')).toBeTruthy()
  expect(route.params).toBeUndefined()
})

it('says what to do next when nothing has been captured yet', async () => {
  renderScreen()

  await waitFor(() => expect(screen.getByText('No photos yet')).toBeTruthy())
})

it('remove deletes the local file as well as the row', async () => {
  const id = await seedDraft('drop-me.jpg')
  const row = await database.get<PendingMedia>('pending_media').find(id)
  const localPath = row.localPath

  renderScreen()

  await waitFor(() => expect(screen.getByLabelText('Remove drop-me.jpg')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('Remove drop-me.jpg'))

  await waitFor(async () => {
    expect(await database.get<PendingMedia>('pending_media').query().fetchCount()).toBe(0)
  })

  // The file half. Without it the app leaks a copy in app-private storage that
  // nothing will ever clean up.
  expect(fsCalls.deletes).toContain(localPath)
})

it('retake drops that photo and returns to the camera', async () => {
  const id = await seedDraft('blurry.jpg')
  const row = await database.get<PendingMedia>('pending_media').find(id)
  const localPath = row.localPath

  renderScreen()

  await waitFor(() => expect(screen.getByLabelText('Retake blurry.jpg')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('Retake blurry.jpg'))

  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('CameraCapture'))
  expect(await database.get<PendingMedia>('pending_media').query().fetchCount()).toBe(0)
  expect(fsCalls.deletes).toContain(localPath)
})

it('stops offering another photo at the cap', async () => {
  await seedDraft('a.jpg')
  await seedDraft('b.jpg')
  await seedDraft('c.jpg')

  renderScreen()

  await waitFor(() => expect(screen.getByText('3 of 3')).toBeTruthy())

  fireEvent.press(screen.getByLabelText('Take another photo'))
  expect(navigation.navigate).not.toHaveBeenCalledWith('CameraCapture')
})

it('updates the strip when a photo is removed, without a remount', async () => {
  await seedDraft('first.jpg')
  await seedDraft('second.jpg')

  renderScreen()

  await waitFor(() => expect(screen.getByText('2 of 3')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('Remove first.jpg'))

  await waitFor(() => expect(screen.getByText('1 of 3')).toBeTruthy())
  expect(screen.queryByLabelText('Remove first.jpg')).toBeNull()
  expect(screen.getByLabelText('Remove second.jpg')).toBeTruthy()
})

/**
 * Done returns to the spot form, not the Create menu.
 *
 * `navigate` resolves to the `CreateSpot` instance already on the stack, so the
 * title and coordinates typed before the capture detour survive it. Sending the
 * user back to the menu instead discards that form silently — and leaves the
 * captured photos unbound, which is the exact state STOURIFY-5 exists to end.
 */
it('done returns to the spot form the photos belong to', async () => {
  await seedDraft('one.jpg')
  renderScreen()

  await waitFor(() => {
    expect(screen.getByLabelText('Done adding photos')).toBeTruthy()
  })

  fireEvent.press(screen.getByLabelText('Done adding photos'))

  // `popTo`, not `navigate`. React Navigation 7 made `navigate` push a NEW
  // screen when the target is not the current one, so `navigate('CreateSpot')`
  // returns the user to a blank form with everything they typed gone. That
  // failed on the device while this file was green — a mocked navigator records
  // the call and knows nothing about what the real one does with it.
  expect(navigation.popTo).toHaveBeenCalledWith('CreateSpot')
  expect(navigation.navigate).not.toHaveBeenCalledWith('CreateSpot')
  expect(navigation.navigate).not.toHaveBeenCalledWith('CreateMenu')
})

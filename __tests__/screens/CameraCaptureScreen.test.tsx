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
    size = 2048

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

const mockTakePictureAsync = jest.fn()
const mockRequestPermission = jest.fn()
let mockPermission: { granted: boolean; canAskAgain: boolean } | null = {
  granted: true,
  canAskAgain: true,
}

jest.mock('expo-camera', () => {
  const React = require('react')
  const { View } = require('react-native')

  return {
    __esModule: true,
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
    CameraView: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePictureAsync }))
      return React.createElement(View, { testID: 'camera-preview', ...props })
    }),
  }
})

const mockLaunchImageLibraryAsync = jest.fn()
const mockRequestMediaLibraryPermissionsAsync = jest.fn(async () => ({ granted: true, status: 'granted' }))

jest.mock('expo-image-picker', () => ({
  __esModule: true,
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissionsAsync(),
  MediaTypeOptions: { Images: 'Images' },
}))

import CameraCaptureScreen from '@/features/media/screens/CameraCaptureScreen'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = { params: undefined } as any

let database: Database

beforeEach(() => {
  jest.clearAllMocks()
  database = createTestDatabase()
  fsCalls.copies = []
  fsCalls.deletes = []
  mockPermission = { granted: true, canAskAgain: true }
  mockTakePictureAsync.mockResolvedValue({ uri: 'file:///cache/Camera/shot.jpg', width: 4, height: 3 })
  mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null })
})

function renderScreen() {
  return render(
    <TestProviders database={database}>
      <CameraCaptureScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

describe('permission gate', () => {
  it('explains and offers the prompt rather than showing a dead camera when access is not granted', async () => {
    mockPermission = { granted: false, canAskAgain: true }

    renderScreen()

    expect(screen.queryByTestId('camera-preview')).toBeNull()
    fireEvent.press(screen.getByLabelText('Allow camera'))
    expect(mockRequestPermission).toHaveBeenCalled()
  })

  it('shows the camera once access is granted', async () => {
    renderScreen()

    await waitFor(() => expect(screen.getByTestId('camera-preview')).toBeTruthy())
  })
})

describe('capture', () => {
  it('writes the outbox row before it navigates, and puts no media in navigation state', async () => {
    renderScreen()

    await waitFor(() => expect(screen.getByTestId('camera-preview')).toBeTruthy())
    fireEvent.press(screen.getByLabelText('Take photo'))

    await waitFor(async () => {
      expect(await database.get<PendingMedia>('pending_media').query().fetchCount()).toBe(1)
    })

    const [row] = await database.get<PendingMedia>('pending_media').query().fetch()
    expect(row.localPath).not.toBe('file:///cache/Camera/shot.jpg')
    expect(row.localPath).toContain('media-outbox')
    expect(row.hostUuid).toBe('')

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('PhotoReview'))

    // Exactly one argument. A second one would be a media payload living in
    // navigation state — design-spec §2.3 rule 4, and the difference between
    // offline-capable and "works if you reconnect before Android reclaims the
    // cache".
    expect(navigation.navigate.mock.calls[0]).toHaveLength(1)
  })

  it('does not navigate when the capture fails — the review step is downstream of a durable row', async () => {
    mockTakePictureAsync.mockRejectedValue(new Error('shutter jammed'))

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('camera-preview')).toBeTruthy())
    fireEvent.press(screen.getByLabelText('Take photo'))

    await waitFor(() => expect(screen.getByText(/could not be saved/i)).toBeTruthy())

    expect(navigation.navigate).not.toHaveBeenCalled()
    expect(await database.get<PendingMedia>('pending_media').query().fetchCount()).toBe(0)
  })
})

describe('gallery pick', () => {
  it('opens the picker with its built-in editor and lands the asset in the same outbox', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'content://media/external/images/media/42', fileName: 'cove.png', mimeType: 'image/png' }],
    })

    renderScreen()

    fireEvent.press(screen.getByLabelText('Choose from gallery'))

    await waitFor(async () => {
      expect(await database.get<PendingMedia>('pending_media').query().fetchCount()).toBe(1)
    })

    // Crop comes from the picker's own native editor — cut-list item 4 kills
    // filters, not cropping.
    expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true }))

    const [row] = await database.get<PendingMedia>('pending_media').query().fetch()
    expect(row.filename).toBe('cove.png')
    expect(row.mime).toBe('image/png')
    expect(row.hostUuid).toBe('')
  })
})

describe('the cap', () => {
  it('stops at three photos rather than discovering the limit at publish', async () => {
    renderScreen()

    await waitFor(() => expect(screen.getByTestId('camera-preview')).toBeTruthy())

    for (let i = 0; i < 3; i += 1) {
      mockTakePictureAsync.mockResolvedValue({ uri: `file:///cache/Camera/shot-${i}.jpg`, width: 4, height: 3 })
      fireEvent.press(screen.getByLabelText('Take photo'))
      // eslint-disable-next-line no-await-in-loop
      await waitFor(async () => {
        expect(await database.get<PendingMedia>('pending_media').query().fetchCount()).toBe(i + 1)
      })
    }

    await waitFor(() => expect(screen.getByText('3 of 3')).toBeTruthy())

    mockTakePictureAsync.mockClear()
    fireEvent.press(screen.getByLabelText('Take photo'))

    expect(mockTakePictureAsync).not.toHaveBeenCalled()
    expect(await database.get<PendingMedia>('pending_media').query().fetchCount()).toBe(3)
  })
})

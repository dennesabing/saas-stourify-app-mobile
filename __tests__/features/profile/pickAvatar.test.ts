import { exifGpsSegment, jpegWith } from '../../support/jpegFixtures'
import { stripImageMetadata } from '@/shared/media/stripImageMetadata'

/**
 * Picking a new profile photo (STOURIFY-307).
 *
 * The seam these tests hold is **which bytes leave the phone**. The photo the
 * gallery hands back carries an EXIF block with real coordinates in it, so the
 * assertion that they are gone from the copy that gets uploaded is capable of
 * failing. A profile photo is often a selfie taken at home.
 */
const mockPickedBytes = jpegWith([exifGpsSegment()])
const mockWritten = new Map<string, Uint8Array>()

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('')
    }

    bytes() {
      return Promise.resolve(mockPickedBytes)
    }

    write(content: Uint8Array) {
      mockWritten.set(this.uri, content)
    }
  }

  return { __esModule: true, File: MockFile, Paths: { cache: { uri: 'file:///cache/' } } }
})

const mockRequestPermission = jest.fn()
const mockLaunchLibrary = jest.fn()

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: () => mockRequestPermission(),
  launchImageLibraryAsync: (options: unknown) => mockLaunchLibrary(options),
}))

import { pickAvatar } from '@/features/profile/api/pickAvatar'

beforeEach(() => {
  jest.clearAllMocks()
  mockWritten.clear()
  mockRequestPermission.mockResolvedValue({ status: 'granted' })
  mockLaunchLibrary.mockResolvedValue({
    canceled: false,
    assets: [
      { uri: 'file:///picked/IMG_0001.jpg', mimeType: 'image/jpeg', fileName: 'IMG_0001.jpg' },
    ],
  })
})

test('the file handed back is a copy in the cache folder with the location stripped', async () => {
  const result = await pickAvatar()

  expect(result.kind).toBe('picked')
  if (result.kind !== 'picked') return

  expect(result.file.uri.startsWith('file:///cache/')).toBe(true)
  expect(result.file.type).toBe('image/jpeg')
  expect(result.file.name.endsWith('.jpg')).toBe(true)

  const written = mockWritten.get(result.file.uri)
  expect(written).toEqual(stripImageMetadata(mockPickedBytes))
  // The fixture really did carry the label, so the line above can fail.
  expect(written?.length).toBeLessThan(mockPickedBytes.length)
})

test('asks the gallery for exactly one photo, and never a video', async () => {
  await pickAvatar()

  expect(mockLaunchLibrary).toHaveBeenCalledWith(
    expect.objectContaining({ mediaTypes: ['images'], allowsMultipleSelection: false }),
  )
})

test('backing out of the gallery is not an error and writes nothing', async () => {
  mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: null })

  await expect(pickAvatar()).resolves.toEqual({ kind: 'cancelled' })
  expect(mockWritten.size).toBe(0)
})

test('a refused photo permission says so and never opens the gallery', async () => {
  mockRequestPermission.mockResolvedValue({ status: 'denied' })

  await expect(pickAvatar()).resolves.toEqual({ kind: 'denied' })
  expect(mockLaunchLibrary).not.toHaveBeenCalled()
})

test('a PNG keeps its type and extension', async () => {
  mockLaunchLibrary.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///picked/shot.png', mimeType: 'image/png', fileName: 'shot.png' }],
  })

  const result = await pickAvatar()

  expect(result.kind === 'picked' && result.file.type).toBe('image/png')
  expect(result.kind === 'picked' && result.file.name.endsWith('.png')).toBe(true)
})

/**
 * A deterministic stand-in for the native filesystem module, shaped like the
 * one `queueLocalMedia.test.ts` uses — `bytes()` is the only method this path
 * needs, and it is the same read `sync/mediaDrain.ts` performs before a PUT.
 */
jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string

    size = 4096

    constructor(uri: string) {
      this.uri = uri
    }

    bytes() {
      return Promise.resolve(new Uint8Array([1, 2, 3]))
    }
  }

  return { __esModule: true, File: MockFile }
})

const mockRequestUploadUrl = jest.fn()
const mockPutFile = jest.fn()
const mockAttachMedia = jest.fn()

jest.mock('@/shared/api/media', () => ({
  requestUploadUrl: (...args: unknown[]) => mockRequestUploadUrl(...args),
  putFile: (...args: unknown[]) => mockPutFile(...args),
  attachMedia: (...args: unknown[]) => mockAttachMedia(...args),
}))

import { POST_MEDIA_HOST_TYPE, uploadPostMedia } from '@/features/social/api/uploadPostMedia'

beforeEach(() => {
  jest.clearAllMocks()
  mockRequestUploadUrl.mockImplementation((input: { filename: string }) =>
    Promise.resolve({
      key: `pending/${input.filename}`,
      url: `https://spaces.example/${input.filename}`,
      headers: { 'Content-Type': 'image/jpeg' },
      expires_at: '2026-08-11T00:15:00Z',
    }),
  )
  mockPutFile.mockResolvedValue(undefined)
  mockAttachMedia.mockResolvedValue({})
})

it('addresses the post by its morph alias, never an FQCN', () => {
  expect(POST_MEDIA_HOST_TYPE).toBe('stourify_post')
})

it('presigns, PUTs and attaches every asset against the post', async () => {
  await uploadPostMedia('post-uuid-1', [
    { uri: 'file:///tmp/a.jpg', type: 'image/jpeg', fileName: 'a.jpg' },
    { uri: 'file:///tmp/b.jpg', type: 'image/jpeg', fileName: 'b.jpg' },
  ])

  expect(mockRequestUploadUrl).toHaveBeenCalledTimes(2)
  expect(mockPutFile).toHaveBeenCalledTimes(2)
  expect(mockAttachMedia).toHaveBeenCalledTimes(2)

  expect(mockRequestUploadUrl).toHaveBeenNthCalledWith(1, {
    filename: 'a.jpg',
    contentType: 'image/jpeg',
    size: 4096,
    modelType: 'stourify_post',
    modelUuid: 'post-uuid-1',
  })
  expect(mockAttachMedia).toHaveBeenNthCalledWith(2, {
    key: 'pending/b.jpg',
    name: 'b.jpg',
    modelType: 'stourify_post',
    modelUuid: 'post-uuid-1',
  })
})

/**
 * The signature covers the declared `ContentType`, so the presign's own headers
 * are replayed verbatim — see `putFile`'s docblock on why this must not go
 * through the Sanctum-authenticated `client`.
 */
it('PUTs to the presigned URL with the headers the presign returned', async () => {
  await uploadPostMedia('post-uuid-1', [
    { uri: 'file:///tmp/a.jpg', type: 'image/jpeg', fileName: 'a.jpg' },
  ])

  expect(mockPutFile).toHaveBeenCalledWith(
    'https://spaces.example/a.jpg',
    { 'Content-Type': 'image/jpeg' },
    new Uint8Array([1, 2, 3]),
  )
})

it('names an asset the picker gave no filename for', async () => {
  await uploadPostMedia('post-uuid-1', [{ uri: 'file:///tmp/x' }])

  expect(mockRequestUploadUrl).toHaveBeenCalledWith(
    expect.objectContaining({ filename: 'photo_0.jpg', contentType: 'image/jpeg' }),
  )
})

it('does nothing at all when there are no assets', async () => {
  await uploadPostMedia('post-uuid-1', [])

  expect(mockRequestUploadUrl).not.toHaveBeenCalled()
})

/**
 * A failure must reach the caller: `PostComposeScreen` publishes only once every
 * attach resolved, so swallowing this would publish a post with missing photos.
 */
it('rejects rather than swallowing a failed attach', async () => {
  mockAttachMedia.mockRejectedValueOnce(new Error('413 Payload Too Large'))

  await expect(
    uploadPostMedia('post-uuid-1', [{ uri: 'file:///tmp/a.jpg', fileName: 'a.jpg' }]),
  ).rejects.toThrow('413 Payload Too Large')
})

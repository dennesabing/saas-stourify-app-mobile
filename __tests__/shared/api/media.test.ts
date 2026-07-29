const mockClientPost = jest.fn()

jest.mock('@/shared/api/client', () => ({
  client: { post: (...args: unknown[]) => mockClientPost(...args) },
}))

jest.mock('axios', () => {
  const actual = jest.requireActual('axios')
  return {
    __esModule: true,
    ...actual,
    default: { ...actual.default, put: jest.fn() },
  }
})

import axios from 'axios'
import { attachMedia, putFile, requestUploadUrl } from '@/shared/api/media'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('requestUploadUrl', () => {
  it('POSTs to /media/upload-url with the presign contract, via the authenticated client', async () => {
    mockClientPost.mockResolvedValueOnce({
      data: {
        data: {
          key: 'media-outbox/abc.jpg',
          url: 'https://s3.example.com/bucket/media-outbox/abc.jpg?X-Amz-Signature=...',
          headers: { 'Content-Type': 'image/jpeg' },
          expires_at: '2026-07-29T12:15:00Z',
        },
        message: 'ok',
      },
    })

    const result = await requestUploadUrl({
      filename: 'beach.jpg',
      contentType: 'image/jpeg',
      size: 12345,
      modelType: 'stourify_spot',
      modelUuid: 'spot-uuid-1',
    })

    expect(mockClientPost).toHaveBeenCalledWith('/media/upload-url', {
      filename: 'beach.jpg',
      content_type: 'image/jpeg',
      size: 12345,
      model_type: 'stourify_spot',
      model_uuid: 'spot-uuid-1',
    })
    expect(result.key).toBe('media-outbox/abc.jpg')
    expect(result.url).toContain('X-Amz-Signature')
    expect(result.headers).toEqual({ 'Content-Type': 'image/jpeg' })
  })
})

describe('putFile', () => {
  it('PUTs the raw bytes to the absolute presigned URL, replaying headers verbatim', async () => {
    ;(axios.put as jest.Mock).mockResolvedValueOnce({ status: 200 })

    const bytes = new Uint8Array([1, 2, 3])
    await putFile(
      'https://s3.example.com/bucket/media-outbox/abc.jpg?X-Amz-Signature=...',
      { 'Content-Type': 'image/jpeg' },
      bytes,
    )

    expect(axios.put).toHaveBeenCalledTimes(1)
    const [url, body, config] = (axios.put as jest.Mock).mock.calls[0]
    expect(url).toBe('https://s3.example.com/bucket/media-outbox/abc.jpg?X-Amz-Signature=...')
    expect(body).toBe(bytes)
    expect(config.headers).toEqual({ 'Content-Type': 'image/jpeg' })
  })

  it('does not carry the app baseURL or an Authorization header — it never touches the shared client', async () => {
    ;(axios.put as jest.Mock).mockResolvedValueOnce({ status: 200 })

    await putFile('https://s3.example.com/x', { 'Content-Type': 'image/jpeg' }, new Uint8Array())

    // The shared, interceptor-bearing `client` is never invoked by putFile.
    expect(mockClientPost).not.toHaveBeenCalled()
    const [, , config] = (axios.put as jest.Mock).mock.calls[0]
    expect(config.headers.Authorization).toBeUndefined()
    expect(config.baseURL).toBeUndefined()
  })
})

describe('attachMedia', () => {
  it('POSTs to /media/attach with the attach contract, via the authenticated client', async () => {
    mockClientPost.mockResolvedValueOnce({
      data: {
        data: {
          id: 1,
          uuid: 'media-uuid-1',
          name: 'beach',
          file_name: 'beach.jpg',
          mime_type: 'image/jpeg',
          size: 12345,
          url: 'https://cdn.example.com/beach.jpg',
          thumb_url: 'https://cdn.example.com/beach-thumb.jpg',
          collection_name: 'attachments',
          created_at: '2026-07-29T12:00:00Z',
          can: { download: true, delete: true },
        },
        message: 'ok',
      },
    })

    const media = await attachMedia({
      key: 'media-outbox/abc.jpg',
      modelType: 'stourify_spot',
      modelUuid: 'spot-uuid-1',
    })

    expect(mockClientPost).toHaveBeenCalledWith('/media/attach', {
      key: 'media-outbox/abc.jpg',
      name: undefined,
      collection: undefined,
      model_type: 'stourify_spot',
      model_uuid: 'spot-uuid-1',
    })
    expect(media.uuid).toBe('media-uuid-1')
  })

  it('surfaces a 422 raised after the bytes already uploaded — the size ceiling is enforced here, not at presign', async () => {
    const error = Object.assign(new Error('Request failed with status code 422'), {
      isAxiosError: true,
      response: {
        status: 422,
        data: { message: 'The file exceeds the maximum size.', errors: { size: ['too large'] } },
      },
    })
    mockClientPost.mockRejectedValueOnce(error)

    await expect(
      attachMedia({ key: 'media-outbox/big.jpg', modelType: 'stourify_spot', modelUuid: 'spot-uuid-1' }),
    ).rejects.toMatchObject({
      response: { status: 422, data: { message: 'The file exceeds the maximum size.' } },
    })
  })
})

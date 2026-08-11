import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AxiosError } from 'axios'
import PostComposeScreen from '@/features/social/screens/PostComposeScreen'
import { useUIStore } from '@/shared/store'
import type { Spot } from '@/shared/api/types'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

/** Every call the screen makes, in the order it made them (STOURIFY-18). */
const calls: string[] = []

const mockCreatePost = jest.fn()
const mockPublishPost = jest.fn()
const mockUploadPostMedia = jest.fn()

jest.mock('@/shared/api/posts', () => ({
  createPost: (...args: unknown[]) => {
    calls.push('createPost')
    return mockCreatePost(...args)
  },
  publishPost: (...args: unknown[]) => {
    calls.push('publishPost')
    return mockPublishPost(...args)
  },
}))

jest.mock('@/features/social/api/uploadPostMedia', () => ({
  uploadPostMedia: (...args: unknown[]) => {
    calls.push('uploadPostMedia')
    return mockUploadPostMedia(...args)
  },
}))

const navigation = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() } as any

const ASSETS = [
  { uri: 'file:///tmp/photo_0.jpg', type: 'image/jpeg', fileName: 'photo_0.jpg' },
  { uri: 'file:///tmp/photo_1.jpg', type: 'image/jpeg', fileName: 'photo_1.jpg' },
]

const route = { params: { mediaAssets: ASSETS } } as any
const emptyRoute = { params: { mediaAssets: [] } } as any

const SPOT: Spot = {
  id: '1',
  uuid: 'spot-uuid-1',
  name: 'Hidden Cove',
  slug: 'hidden-cove',
  latitude: 6.1164,
  longitude: 125.1716,
  status: 'active',
} as Spot

beforeEach(() => {
  jest.clearAllMocks()
  calls.length = 0
  useUIStore.setState({ pendingSpot: null })
  mockCreatePost.mockResolvedValue({ uuid: 'post-uuid-1' })
  mockUploadPostMedia.mockResolvedValue(undefined)
  mockPublishPost.mockResolvedValue({ uuid: 'post-uuid-1' })
})

function renderScreen(withRoute: any = route) {
  return render(
    <TestProviders database={createTestDatabase()}>
      <PostComposeScreen navigation={navigation} route={withRoute} />
    </TestProviders>,
  )
}

/**
 * `spot_uuid` is the only spot field `PostStoreRequest` accepts.
 *
 * Until STOURIFY-2 this screen sent `spot_name`, `spot_latitude` and
 * `spot_longitude` instead. Laravel drops unvalidated keys without erroring, so
 * the post was created and the spot association was thrown away — tagging a
 * spot had never once worked, and nothing anywhere reported a failure.
 */
it('sends `spot_uuid` from the tagged spot', async () => {
  useUIStore.setState({ pendingSpot: SPOT })
  renderScreen()

  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(mockCreatePost).toHaveBeenCalledTimes(1)
  })

  expect(mockCreatePost.mock.calls[0][0]).toMatchObject({ spot_uuid: 'spot-uuid-1' })
})

it('omits the spot entirely when nothing was tagged', async () => {
  renderScreen()

  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(mockCreatePost).toHaveBeenCalledTimes(1)
  })

  expect(Object.keys(mockCreatePost.mock.calls[0][0])).not.toContain('spot_uuid')
})

/**
 * The whole of STOURIFY-18, stated once.
 *
 * `PostStoreRequest` validates only `spot_uuid`, `caption`, `visibility` and
 * `publish` — so the `media[0]`, `media[1]`, … multipart parts this screen used
 * to append were discarded server-side without an error, and every composed post
 * was created with no photos. It never sent `publish` either, so `store()` left
 * `published_at` null and the post never reached a feed.
 *
 * The server's own contract, spelled out in `PostStoreRequest`'s docblock, is
 * create-unpublished → upload → publish. This asserts the client executes it.
 */
it('creates the post unpublished, uploads its photos, then publishes it — in that order', async () => {
  renderScreen()

  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(mockPublishPost).toHaveBeenCalledTimes(1)
  })

  expect(calls).toEqual(['createPost', 'uploadPostMedia', 'publishPost'])
  expect(mockCreatePost.mock.calls[0][0]).toMatchObject({ publish: false, visibility: 'public' })
  expect(mockUploadPostMedia).toHaveBeenCalledWith('post-uuid-1', ASSETS)
  expect(mockPublishPost).toHaveBeenCalledWith('post-uuid-1')
})

it('sends no `media` key and no FormData to `POST /posts`', async () => {
  renderScreen()

  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(mockCreatePost).toHaveBeenCalledTimes(1)
  })

  const payload = mockCreatePost.mock.calls[0][0]
  expect(payload).not.toBeInstanceOf(FormData)
  expect(Object.keys(payload).filter((key) => key.startsWith('media'))).toEqual([])
})

it('publishes a post composed with no photos at all', async () => {
  renderScreen(emptyRoute)

  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(mockPublishPost).toHaveBeenCalledWith('post-uuid-1')
  })
})

/**
 * A post whose photos did not upload must not go live without them. Leaving it
 * unpublished is recoverable — the record exists, `publish` is idempotent — and
 * it is the state `PostApiController::publish()` was written for.
 */
it('does not publish, and reports the failure, when an upload fails', async () => {
  mockUploadPostMedia.mockRejectedValue(new AxiosError('Upload failed'))
  renderScreen()

  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(screen.getByText(/upload failed/i)).toBeTruthy()
  })

  expect(mockPublishPost).not.toHaveBeenCalled()
  expect(navigation.popToTop).not.toHaveBeenCalled()
})

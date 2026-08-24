import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AxiosError } from 'axios'
import PostComposeScreen from '@/features/social/screens/PostComposeScreen'
import { useUIStore } from '@/shared/store'
import type { Spot } from '@/shared/api/types'
import type { Database } from '@nozbe/watermelondb'
import type PostDraft from '@/db/models/PostDraft'
import { saveDraft } from '@/features/social/api/postDrafts'
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

/** The server's exact shape — `SpotResource::toArray()` sends `title`, never `name` (STOURIFY-11). */
const SPOT: Spot = {
  uuid: 'spot-uuid-1',
  title: 'Hidden Cove',
  slug: 'hidden-cove',
  latitude: 6.1164,
  longitude: 125.1716,
  status: 'active',
}

/**
 * Two error shapes, and telling them apart is the whole of STOURIFY-161.
 *
 * `dropped()` is a request that never reached a server at all — a tunnel, a
 * lift, aeroplane mode. `refusal()` is a server that answered and said no.
 * Before this card both were "the share failed"; now only the second one is.
 */
function dropped(): AxiosError {
  return new AxiosError('Network Error', 'ERR_NETWORK')
}

function refusal(message: string): AxiosError {
  const error = new AxiosError(message)
  error.response = {
    status: 422,
    data: { message },
    statusText: '',
    headers: {},
    config: {} as any,
  }
  return error
}

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

/**
 * The row showed the tagged spot's `name`, which the server has never sent — so
 * tagging a spot correctly still left the row reading `undefined` (STOURIFY-11).
 */
it('shows the tagged spot title on the Tag a Spot row', () => {
  useUIStore.setState({ pendingSpot: SPOT })
  renderScreen()

  expect(screen.getByText('Hidden Cove')).toBeTruthy()
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
  expect(mockCreatePost.mock.calls[0][0]).toMatchObject({ publish: false, visibility: 'private' })
  expect(mockUploadPostMedia).toHaveBeenCalledWith('post-uuid-1', ASSETS)
  expect(mockPublishPost).toHaveBeenCalledWith('post-uuid-1')
})

/**
 * A new post starts locked, not shared (STOURIFY-105).
 *
 * The picker used to open on "🌍 Public", so an author who never looked at it
 * published to everyone by accident. Private is now the option already
 * selected, and the untouched payload says so.
 */
it('defaults the visibility picker to Private and sends that when it is untouched', async () => {
  renderScreen()

  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(mockCreatePost).toHaveBeenCalledTimes(1)
  })

  expect(mockCreatePost.mock.calls[0][0]).toMatchObject({ visibility: 'private' })
})

/** Private is the starting point, never a ceiling — Public is still one tap away. */
it('sends the chosen visibility when the author picks Public', async () => {
  renderScreen()

  fireEvent.press(screen.getByText('🌍 Public'))
  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(mockCreatePost).toHaveBeenCalledTimes(1)
  })

  expect(mockCreatePost.mock.calls[0][0]).toMatchObject({ visibility: 'public' })
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
  mockUploadPostMedia.mockRejectedValue(refusal('Upload failed'))
  renderScreen()

  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(screen.getByText(/upload failed/i)).toBeTruthy()
  })

  expect(mockPublishPost).not.toHaveBeenCalled()
  expect(navigation.popToTop).not.toHaveBeenCalled()
})

/**
 * Drafts (STOURIFY-159).
 *
 * These build a database of their own, so the test can look at what the screen
 * actually wrote down — `renderScreen` above makes a fresh one per render and
 * does not hand it back.
 */
describe('drafts', () => {
  function renderWithDatabase(database: Database, withRoute: any = route) {
    return render(
      <TestProviders database={database}>
        <PostComposeScreen navigation={navigation} route={withRoute} />
      </TestProviders>,
    )
  }

  it('writes down what was typed when the screen goes away', async () => {
    const database = createTestDatabase()
    const view = renderWithDatabase(database)

    fireEvent.changeText(screen.getByPlaceholderText('Write a caption...'), 'Sunset at the pier')
    view.unmount()

    await waitFor(async () => {
      expect(await database.get('post_drafts').query().fetchCount()).toBe(1)
    })

    const drafts = await database.get<PostDraft>('post_drafts').query().fetch()
    expect(drafts[0].caption).toBe('Sunset at the pier')
    expect(drafts[0].media).toHaveLength(2)
  })

  it('leaves nothing behind when the author changed nothing', async () => {
    const database = createTestDatabase()
    const view = renderWithDatabase(database)

    view.unmount()

    await waitFor(() => {
      expect(navigation.popToTop).not.toHaveBeenCalled()
    })
    expect(await database.get('post_drafts').query().fetchCount()).toBe(0)
  })

  it('keeps one draft, not one per edit', async () => {
    const database = createTestDatabase()
    const view = renderWithDatabase(database)
    const caption = screen.getByPlaceholderText('Write a caption...')

    fireEvent.changeText(caption, 'Sun')
    fireEvent.changeText(caption, 'Sunset')
    fireEvent.changeText(caption, 'Sunset at the pier')
    view.unmount()

    await waitFor(async () => {
      expect(await database.get('post_drafts').query().fetchCount()).toBe(1)
    })
  })

  it('puts the author back where they were when opened from the Drafts page', async () => {
    const database = createTestDatabase()
    const draftId = await saveDraft(database, {
      caption: 'Half a thought',
      visibility: 'public',
      spotUuid: 'spot-uuid-1',
      spotTitle: 'Hidden Cove',
      media: ASSETS,
    })

    renderWithDatabase(database, { params: { draftId } } as any)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Half a thought')).toBeTruthy()
    })
    expect(screen.getByText('Hidden Cove')).toBeTruthy()
  })

  it('throws the draft away once the post is actually shared', async () => {
    const database = createTestDatabase()
    const view = renderWithDatabase(database)

    fireEvent.changeText(screen.getByPlaceholderText('Write a caption...'), 'Going out')
    fireEvent.press(screen.getByText('Share Post'))

    await waitFor(() => {
      expect(navigation.popToTop).toHaveBeenCalled()
    })

    view.unmount()
    expect(await database.get('post_drafts').query().fetchCount()).toBe(0)
  })

  /** The work has to survive the thing that stopped it being sent. */
  it('keeps the draft when the upload fails', async () => {
    mockUploadPostMedia.mockRejectedValue(refusal('Upload failed'))
    const database = createTestDatabase()
    renderWithDatabase(database)

    fireEvent.changeText(screen.getByPlaceholderText('Write a caption...'), 'Nearly there')
    fireEvent.press(screen.getByText('Share Post'))

    await waitFor(() => {
      expect(screen.getByText(/upload failed/i)).toBeTruthy()
    })

    await waitFor(async () => {
      expect(await database.get('post_drafts').query().fetchCount()).toBe(1)
    })
  })
})

/**
 * Pressing Share with no signal (STOURIFY-161).
 *
 * The rule these tests pin down: the app tries the real request every time, and
 * only what actually came back decides what happens next. A request that never
 * reached a server means the post waits; a server that answered and refused
 * means the author has something to fix.
 */
describe('sharing with no signal', () => {
  function renderWithDatabase(database: Database, withRoute: any = route) {
    return render(
      <TestProviders database={database}>
        <PostComposeScreen navigation={navigation} route={withRoute} />
      </TestProviders>,
    )
  }

  it('puts the post in the send-later queue instead of showing an error', async () => {
    mockCreatePost.mockRejectedValue(dropped())
    const database = createTestDatabase()
    renderWithDatabase(database)

    fireEvent.changeText(screen.getByPlaceholderText('Write a caption...'), 'Written in a tunnel')
    fireEvent.press(screen.getByText('Share Post'))

    await waitFor(async () => {
      expect(await database.get('post_outbox').query().fetchCount()).toBe(1)
    })

    const [queued]: any[] = await database.get('post_outbox').query().fetch()
    expect(queued.caption).toBe('Written in a tunnel')
    expect(queued.state).toBe('queued')
    expect(screen.queryByText(/network error/i)).toBeNull()
    await waitFor(() => expect(navigation.popToTop).toHaveBeenCalled())
  })

  it('takes the post off the Drafts page, so it cannot be shared twice', async () => {
    mockCreatePost.mockRejectedValue(dropped())
    const database = createTestDatabase()
    const view = renderWithDatabase(database)

    fireEvent.changeText(screen.getByPlaceholderText('Write a caption...'), 'Going out later')
    fireEvent.press(screen.getByText('Share Post'))

    await waitFor(async () => {
      expect(await database.get('post_outbox').query().fetchCount()).toBe(1)
    })

    // Unmounting is what would normally write the draft one last time. It must
    // not resurrect a post that is already on its way.
    view.unmount()
    await waitFor(async () => {
      expect(await database.get('post_drafts').query().fetchCount()).toBe(0)
    })
  })

  it('remembers a post the server had already accepted before the signal died', async () => {
    mockCreatePost.mockResolvedValue({ uuid: 'post-half-made' })
    mockUploadPostMedia.mockRejectedValue(dropped())
    const database = createTestDatabase()
    renderWithDatabase(database)

    fireEvent.press(screen.getByText('Share Post'))

    await waitFor(async () => {
      expect(await database.get('post_outbox').query().fetchCount()).toBe(1)
    })

    const [queued]: any[] = await database.get('post_outbox').query().fetch()
    expect(queued.postUuid).toBe('post-half-made')
    expect(mockPublishPost).not.toHaveBeenCalled()
  })

  it('queues nothing, and says what went wrong, when the server refuses the post', async () => {
    mockCreatePost.mockRejectedValue(refusal('The caption is too long.'))
    const database = createTestDatabase()
    renderWithDatabase(database)

    fireEvent.changeText(screen.getByPlaceholderText('Write a caption...'), 'Too much')
    fireEvent.press(screen.getByText('Share Post'))

    await waitFor(() => expect(screen.getByText(/caption is too long/i)).toBeTruthy())

    expect(await database.get('post_outbox').query().fetchCount()).toBe(0)
    expect(navigation.popToTop).not.toHaveBeenCalled()
  })
})

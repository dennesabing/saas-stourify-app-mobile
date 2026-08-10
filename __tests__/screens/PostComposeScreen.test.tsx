import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import PostComposeScreen from '@/features/social/screens/PostComposeScreen'
import { useUIStore } from '@/shared/store'
import type { Spot } from '@/shared/api/types'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

const mockCreatePost = jest.fn()

jest.mock('@/shared/api/posts', () => ({
  createPost: (...args: unknown[]) => mockCreatePost(...args),
}))

const navigation = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() } as any

const route = {
  params: {
    mediaAssets: [{ uri: 'file:///tmp/photo_0.jpg', type: 'image/jpeg', fileName: 'photo_0.jpg' }],
  },
} as any

const SPOT: Spot = {
  id: '1',
  uuid: 'spot-uuid-1',
  name: 'Hidden Cove',
  slug: 'hidden-cove',
  latitude: 6.1164,
  longitude: 125.1716,
  status: 'active',
} as Spot

/**
 * Read back what was appended, whichever `FormData` this process resolved.
 *
 * React Native's polyfill keeps its entries in a `_parts` array of
 * `[name, value]` pairs and implements none of the browser iteration methods;
 * under jest-expo the global can instead be Node's own `FormData`, which has
 * `entries()` and no `_parts`. Handling both keeps the assertion about the
 * payload rather than about which polyfill won.
 */
function partsOf(form: FormData): Array<[string, unknown]> {
  const rnParts = (form as unknown as { _parts?: Array<[string, unknown]> })._parts
  if (Array.isArray(rnParts)) return rnParts

  return Array.from(form.entries()) as Array<[string, unknown]>
}

function valueOf(form: FormData, key: string): unknown {
  return partsOf(form).find(([name]) => name === key)?.[1]
}

beforeEach(() => {
  jest.clearAllMocks()
  useUIStore.setState({ pendingSpot: null })
  mockCreatePost.mockResolvedValue({ uuid: 'post-uuid-1' })
})

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <PostComposeScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

/**
 * `spot_uuid` is the only spot field `PostStoreRequest` accepts.
 *
 * Until STOURIFY-2 this screen appended `spot_name`, `spot_latitude` and
 * `spot_longitude` instead. Laravel drops unvalidated keys without erroring,
 * so the post was created and the spot association was thrown away — tagging a
 * spot had never once worked, and nothing anywhere reported a failure.
 */
it('sends `spot_uuid` from the tagged spot', async () => {
  useUIStore.setState({ pendingSpot: SPOT })
  renderScreen()

  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(mockCreatePost).toHaveBeenCalledTimes(1)
  })

  const [form] = mockCreatePost.mock.calls[0]
  expect(valueOf(form, 'spot_uuid')).toBe('spot-uuid-1')
})

it('sends none of the three descriptive spot fields the server has no rule for', async () => {
  useUIStore.setState({ pendingSpot: SPOT })
  renderScreen()

  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(mockCreatePost).toHaveBeenCalledTimes(1)
  })

  const [form] = mockCreatePost.mock.calls[0]
  const names = partsOf(form).map(([name]) => name)
  expect(names).not.toContain('spot_name')
  expect(names).not.toContain('spot_latitude')
  expect(names).not.toContain('spot_longitude')
})

it('omits the spot entirely when nothing was tagged', async () => {
  renderScreen()

  fireEvent.press(screen.getByText('Share Post'))

  await waitFor(() => {
    expect(mockCreatePost).toHaveBeenCalledTimes(1)
  })

  const [form] = mockCreatePost.mock.calls[0]
  expect(partsOf(form).map(([name]) => name)).not.toContain('spot_uuid')
})

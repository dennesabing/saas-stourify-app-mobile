import { QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import ActivityScreen from '@/features/activity/screens/ActivityScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/follows', () => ({
  getFollowRequests: jest.fn(),
  acceptFollowRequest: jest.fn(),
  declineFollowRequest: jest.fn(),
}))

import { acceptFollowRequest, declineFollowRequest, getFollowRequests } from '@/shared/api/follows'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function renderScreen(queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <ActivityScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )
}

function makeRequest(overrides: Partial<any> = {}) {
  return {
    id: 'f1',
    uuid: 'follow-1',
    status: 'pending',
    follower: { id: 'u1', uuid: 'user-1', name: 'Ana Martinez', email: '' },
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => jest.clearAllMocks())

it("renders pending follow requests with the requester's name", async () => {
  ;(getFollowRequests as jest.Mock).mockResolvedValue({
    data: [
      {
        id: 'f1',
        uuid: 'follow-1',
        status: 'pending',
        follower: { id: 'u1', uuid: 'user-1', name: 'Ana Martinez', email: '' },
        created_at: new Date().toISOString(),
      },
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Ana Martinez')).toBeTruthy()
  })
})

/**
 * The three situations this screen used to answer with two sentences
 * (STOURIFY-86).
 *
 * "Nothing yet" is a statement about the reader's account. A timed-out request
 * is a statement about the network, and it is the only one of the three with an
 * action worth offering. Before this card both said "Nothing yet".
 *
 * Each case asserts the presence of its own copy AND the absence of the
 * others', so two states cannot collapse into one branch and still pass.
 */
describe('a failed follow-request fetch is not an empty inbox', () => {
  it('says the request failed, and offers a retry that re-runs the query', async () => {
    ;(getFollowRequests as jest.Mock).mockRejectedValue(new Error('timeout of 15000ms exceeded'))

    renderScreen()

    await waitFor(() => expect(screen.getByText("Couldn't load your requests")).toBeTruthy())
    expect(screen.queryByText('Nothing yet')).toBeNull()

    expect(getFollowRequests).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('Try again'))

    await waitFor(() => expect(getFollowRequests).toHaveBeenCalledTimes(2))
  })

  it('still says nothing yet when the request succeeds with no requests', async () => {
    ;(getFollowRequests as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })

    renderScreen()

    await waitFor(() => expect(screen.getByText('Nothing yet')).toBeTruthy())
    expect(screen.queryByText("Couldn't load your requests")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('shows the loading placeholders and claims neither while the request is in flight', async () => {
    // Never settles, so the screen stays in its first-load state.
    ;(getFollowRequests as jest.Mock).mockReturnValue(new Promise(() => {}))

    renderScreen()

    // `Skeleton` announces itself as "Loading"; this screen renders two.
    await waitFor(() => expect(screen.getAllByLabelText('Loading')).toHaveLength(2))
    expect(screen.queryByText('Nothing yet')).toBeNull()
    expect(screen.queryByText("Couldn't load your requests")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('keeps showing cached requests when a later fetch fails', async () => {
    ;(getFollowRequests as jest.Mock).mockRejectedValue(new Error('offline'))

    // Rows the reader could already read. The error branch lives inside
    // `ListEmptyComponent`, which never renders while rows exist — so a
    // failing refetch must not cover them.
    const seeded = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    seeded.setQueryData(['follow-requests'], {
      data: [makeRequest()],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 1 },
    })

    renderScreen(seeded)

    await waitFor(() => expect(getFollowRequests).toHaveBeenCalled())

    expect(screen.getByText('Ana Martinez')).toBeTruthy()
    expect(screen.queryByText("Couldn't load your requests")).toBeNull()
    expect(screen.queryByText('Nothing yet')).toBeNull()
  })
})

it('Accept calls the accept API and removes the row', async () => {
  ;(getFollowRequests as jest.Mock).mockResolvedValue({
    data: [
      {
        id: 'f1',
        uuid: 'follow-1',
        status: 'pending',
        follower: { id: 'u1', uuid: 'user-1', name: 'Ana Martinez', email: '' },
        created_at: new Date().toISOString(),
      },
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })
  ;(acceptFollowRequest as jest.Mock).mockResolvedValue({})

  renderScreen()

  await waitFor(() => expect(screen.getByText('Ana Martinez')).toBeTruthy())

  fireEvent.press(screen.getByText('Accept'))

  await waitFor(() => {
    expect(acceptFollowRequest).toHaveBeenCalledWith('follow-1')
    expect(screen.queryByText('Ana Martinez')).toBeNull()
  })
})

it('Decline calls the decline API and removes the row', async () => {
  ;(getFollowRequests as jest.Mock).mockResolvedValue({
    data: [
      {
        id: 'f1',
        uuid: 'follow-1',
        status: 'pending',
        follower: { id: 'u1', uuid: 'user-1', name: 'Ana Martinez', email: '' },
        created_at: new Date().toISOString(),
      },
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })
  ;(declineFollowRequest as jest.Mock).mockResolvedValue(undefined)

  renderScreen()

  await waitFor(() => expect(screen.getByText('Ana Martinez')).toBeTruthy())

  fireEvent.press(screen.getByText('Decline'))

  await waitFor(() => {
    expect(declineFollowRequest).toHaveBeenCalledWith('follow-1')
    expect(screen.queryByText('Ana Martinez')).toBeNull()
  })
})

import { AxiosError, type AxiosResponse } from 'axios'
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
import { trackQueryClient } from '../support/queryClients'

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

const HOUR = 60 * 60_000
const DAY = 24 * HOUR

function page(data: any[]) {
  return { data, links: {}, meta: { current_page: 1, last_page: 1, total: data.length } }
}

/**
 * Artboard 6 of the Home Feed design (STOURIFY-262): a round-back "Activity"
 * header, rows grouped by when they happened, and a sentence with the name,
 * what they did and a short time.
 */
describe('the Activity artboard', () => {
  it('has a round-back Activity header whose back goes to the Home tab', async () => {
    ;(getFollowRequests as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    expect(screen.getByText('Activity')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Back'))
    expect(navigation.navigate).toHaveBeenCalledWith('HomeTab')

    // Let the query settle so nothing updates after the test has ended.
    await waitFor(() => expect(screen.getByText('Nothing yet')).toBeTruthy())
  })

  it('writes each request as one sentence with a short time', async () => {
    ;(getFollowRequests as jest.Mock).mockResolvedValue(
      page([makeRequest({ created_at: new Date(Date.now() - 2 * HOUR - 60_000).toISOString() })]),
    )

    renderScreen()

    await waitFor(() => expect(screen.getByText('Ana Martinez')).toBeTruthy())
    expect(screen.getByText(/wants to follow you\./)).toBeTruthy()
    expect(screen.getByText('2h')).toBeTruthy()
  })

  it('groups requests under one label per period, newest period first', async () => {
    ;(getFollowRequests as jest.Mock).mockResolvedValue(
      page([
        makeRequest({ uuid: 'f-a', created_at: new Date(Date.now() - 60_000).toISOString() }),
        makeRequest({
          uuid: 'f-b',
          follower: { id: 'u2', uuid: 'user-2', name: 'Ben Cruz', email: '' },
          created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
        }),
        makeRequest({
          uuid: 'f-c',
          follower: { id: 'u3', uuid: 'user-3', name: 'Cara Diaz', email: '' },
          created_at: new Date(Date.now() - 3 * DAY).toISOString(),
        }),
        makeRequest({
          uuid: 'f-d',
          follower: { id: 'u4', uuid: 'user-4', name: 'Dan Esteban', email: '' },
          created_at: new Date(Date.now() - 30 * DAY).toISOString(),
        }),
      ]),
    )

    renderScreen()

    await waitFor(() => expect(screen.getByText('Dan Esteban')).toBeTruthy())
    // Two requests today, one label: a label heads its group, not each row.
    expect(screen.getAllByText('Today')).toHaveLength(1)
    expect(screen.getAllByText('This week')).toHaveLength(1)
    expect(screen.getAllByText('Earlier')).toHaveLength(1)

    // Render order: newest period first, and each label before the rows it
    // heads. `getAllByTestId` answers in tree order.
    expect(screen.getAllByTestId(/^activity-(group|row)-/).map((el) => el.props.testID)).toEqual([
      'activity-group-Today',
      'activity-row-f-a',
      'activity-row-f-b',
      'activity-group-This week',
      'activity-row-f-c',
      'activity-group-Earlier',
      'activity-row-f-d',
    ])
  })

  it("opens the requester's profile from their name", async () => {
    ;(getFollowRequests as jest.Mock).mockResolvedValue(page([makeRequest()]))

    renderScreen()

    await waitFor(() => expect(screen.getByText('Ana Martinez')).toBeTruthy())
    fireEvent.press(screen.getByText('Ana Martinez'))
    expect(navigation.navigate).toHaveBeenCalledWith('Profile', { userId: 'user-1' })
  })
})

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
    const seeded = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
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

/**
 * STOURIFY-249, following STOURIFY-225 and STOURIFY-248. This screen answered
 * every failure with one sentence about the connection, including the one where
 * the server answered and refused. The pair is the point: the first test alone
 * would pass if the connection sentence were deleted everywhere, which would
 * break the one case where it is true.
 */
describe('the failure it reports is the failure that happened', () => {
  function forbidden() {
    const config = { headers: {} } as never
    return new AxiosError('Request failed with status code 403', '403', config, {}, {
      status: 403,
      statusText: 'Forbidden',
      data: { message: 'This action is unauthorized.' },
      headers: {},
      config,
    } as AxiosResponse)
  }

  it('does not blame the connection when the server answered 403', async () => {
    ;(getFollowRequests as jest.Mock).mockRejectedValue(forbidden())
    renderScreen()

    await waitFor(() => expect(screen.getByText("Couldn't load your requests")).toBeTruthy())

    expect(screen.queryByText(/check your connection/i)).toBeNull()
    expect(screen.getByText(/isn't allowed/i)).toBeTruthy()
  })

  it('still blames the connection when there really was no answer', async () => {
    ;(getFollowRequests as jest.Mock).mockRejectedValue(
      new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never, {}),
    )
    renderScreen()

    await waitFor(() => expect(screen.getByText("Couldn't load your requests")).toBeTruthy())

    expect(screen.getByText(/check your connection/i)).toBeTruthy()
  })
})

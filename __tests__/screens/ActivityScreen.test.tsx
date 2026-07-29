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

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <ActivityScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )
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

it('shows an empty state when there are no pending requests', async () => {
  ;(getFollowRequests as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Nothing yet')).toBeTruthy()
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

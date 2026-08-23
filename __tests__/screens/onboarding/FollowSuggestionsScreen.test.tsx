import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import FollowSuggestionsScreen from '@/features/onboarding/screens/FollowSuggestionsScreen'
import { useOnboardingStore } from '@/shared/store/onboarding'
import { createTestDatabase } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'

jest.mock('@/shared/api/discover', () => ({ searchPeople: jest.fn() }))
jest.mock('@/shared/api/follows', () => ({ follow: jest.fn(async () => ({})) }))

import { searchPeople } from '@/shared/api/discover'
import { follow } from '@/shared/api/follows'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

beforeEach(() => {
  jest.clearAllMocks()
  useOnboardingStore.setState({ shouldOnboard: true, completed: false })
})

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <FollowSuggestionsScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )
}

it('is search-backed, not a claimed recommendation surface', () => {
  renderScreen()

  expect(screen.queryByText(/suggested for you/i)).toBeNull()
  expect(screen.getByPlaceholderText('Search people')).toBeTruthy()
})

it('searches people on typing and shows a Follow button per hit', async () => {
  ;(searchPeople as jest.Mock).mockResolvedValue({
    data: [
      {
        uuid: 'p1',
        user_uuid: 'user-1',
        username: 'ana',
        name: 'Ana Martinez',
        bio: null,
        is_private: false,
      },
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })

  renderScreen()

  fireEvent.changeText(screen.getByPlaceholderText('Search people'), 'ana')

  await waitFor(() => expect(screen.getByText('Ana Martinez')).toBeTruthy())
  expect(searchPeople).toHaveBeenCalledWith('ana')

  fireEvent.press(screen.getByText('Follow'))

  await waitFor(() => expect(follow).toHaveBeenCalledWith('user-1'))
})

it('Skip completes onboarding', async () => {
  renderScreen()

  fireEvent.press(screen.getByText('Skip'))

  await waitFor(() => {
    expect(useOnboardingStore.getState().completed).toBe(true)
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import SpotPickerScreen from '@/features/social/screens/SpotPickerScreen'
import type { Spot } from '@/shared/api/types'
import { useUIStore } from '@/shared/store'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/spots', () => ({
  getSpots: jest.fn(),
}))

import { getSpots } from '@/shared/api/spots'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

/** The server's exact shape — `SpotResource::toArray()` sends `title`, never `name`. */
const SPOT: Spot = {
  uuid: 'spot-uuid-1',
  title: 'Kalaklan Lighthouse',
  slug: 'kalaklan-lighthouse',
  address: 'Olongapo',
  latitude: 14.8386,
  longitude: 120.2842,
  status: 'active',
}

beforeEach(() => {
  jest.clearAllMocks()
  useUIStore.setState({ pendingSpot: null })
  ;(getSpots as jest.Mock).mockResolvedValue({
    data: [SPOT],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })
})

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <SpotPickerScreen navigation={navigation} route={{ params: undefined } as any} />
    </TestProviders>,
  )
}

/**
 * The picker had no test file at all, which is how it kept rendering a blank
 * title on every row: it read `item.name`, a key `SpotResource` has never sent,
 * and the compiler was happy because `Spot.name` was typed as required
 * (STOURIFY-11).
 */
it('renders each row from the spot title', async () => {
  renderScreen()

  // The query is `enabled` only past two characters, behind a 300 ms debounce.
  fireEvent.changeText(screen.getByPlaceholderText('Search spots...'), 'kalaklan')

  await waitFor(() => expect(getSpots).toHaveBeenCalledWith({ q: 'kalaklan' }))
  await waitFor(() => expect(screen.getByText('Kalaklan Lighthouse')).toBeTruthy())
})

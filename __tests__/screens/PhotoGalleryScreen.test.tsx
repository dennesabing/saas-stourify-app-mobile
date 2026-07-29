import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import PhotoGalleryScreen from '@/features/spots/screens/PhotoGalleryScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/spots', () => ({
  getSpot: jest.fn(),
}))

import { getSpot } from '@/shared/api/spots'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function makeSpot(overrides: Partial<any> = {}) {
  return {
    id: 's1',
    uuid: 'spot-1',
    title: 'Blue Cove',
    slug: 'blue-cove',
    latitude: 6.1,
    longitude: 125.2,
    status: 'active',
    media: [
      { uuid: 'm1', url: 'https://cdn.test/photo1.jpg', thumb_url: null },
      { uuid: 'm2', url: 'https://cdn.test/photo2.jpg', thumb_url: null },
      { uuid: 'm3', url: 'https://cdn.test/photo3.jpg', thumb_url: null },
    ],
    ...overrides,
  }
}

function renderScreen(spotId = 'spot-1') {
  return render(
    <TestProviders database={createTestDatabase()}>
      <PhotoGalleryScreen navigation={navigation} route={{ params: { spotId } } as any} />
    </TestProviders>,
  )
}

beforeEach(() => jest.clearAllMocks())

it('renders every photo full-bleed and a counter', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

  renderScreen()

  await waitFor(() => {
    expect(screen.getByTestId('gallery-photo-0')).toBeTruthy()
    expect(screen.getByTestId('gallery-photo-1')).toBeTruthy()
    expect(screen.getByTestId('gallery-photo-2')).toBeTruthy()
    expect(screen.getByText('1 / 3')).toBeTruthy()
  })
})

it('goes back when the back affordance is pressed', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

  renderScreen()

  await waitFor(() => expect(screen.getByLabelText('Back')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('Back'))

  expect(navigation.goBack).toHaveBeenCalled()
})

it('shows an empty state when the spot has no photos', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ media: [] }))

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('No photos yet')).toBeTruthy()
  })
})

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import NearbyScreen from '@/features/nearby/screens/NearbyScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

/**
 * The map vendor is mocked. Rendering the real `react-native-maps` means
 * rendering a Google native view, which jest cannot do — and which the
 * emulator gate covers anyway. Here the map is only ever a presence check:
 * did the screen get far enough to mount it?
 */
jest.mock('react-native-maps', () => {
  const React = require('react')
  const { View } = require('react-native')

  const MapView = (props: any) =>
    React.createElement(View, { testID: 'nearby-map' }, props.children)
  const Marker = (props: any) =>
    React.createElement(View, { testID: `nearby-marker-${props.title}` })

  return { __esModule: true, default: MapView, Marker }
})

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}))

jest.mock('@/shared/api/feed', () => ({
  getNearbyFeed: jest.fn(),
}))

import * as Location from 'expo-location'
import { getNearbyFeed } from '@/shared/api/feed'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

/** The copy that must appear ONLY when permission was actually refused. */
const PERMISSION_COPY = 'Location access needed'

function position(latitude: number, longitude: number) {
  return { coords: { latitude, longitude } }
}

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <NearbyScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getNearbyFeed as jest.Mock).mockResolvedValue({ data: [], next_cursor: null, prev_cursor: null })
})

it('does not blame permissions when the position request fails', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('no fix'))
  ;(Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(null)

  renderScreen()

  await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())
  expect(screen.queryByText(PERMISSION_COPY)).toBeNull()
})

it('falls back to the last known position when the live fix fails', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('no fix'))
  ;(Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(position(14.5995, 120.9842))

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('nearby-map')).toBeTruthy())
  expect(screen.queryByText(PERMISSION_COPY)).toBeNull()
})

it('falls back when the live fix never settles at all', async () => {
  // The emulator failure this card exists for: the promise does not reject,
  // it simply never resolves, so nothing reaches a `.catch`.
  jest.useFakeTimers()
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockReturnValue(new Promise(() => {}))
  ;(Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(position(14.5995, 120.9842))

  try {
    renderScreen()

    // Let the permission promise settle before the clock is moved.
    await act(async () => {})
    expect(screen.queryByTestId('nearby-map')).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(10_000)
    })

    await waitFor(() => expect(screen.getByTestId('nearby-map')).toBeTruthy())
  } finally {
    jest.useRealTimers()
  }
})

it('still reports a genuine permission denial', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' })

  renderScreen()

  await waitFor(() => expect(screen.getByText(PERMISSION_COPY)).toBeTruthy())
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
  expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled()
})

it('retries the request in place without leaving the screen', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(new Error('no fix'))
  ;(Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValueOnce(null)

  renderScreen()

  await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())

  ;(Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(position(14.5995, 120.9842))

  fireEvent.press(screen.getByText('Try again'))

  await waitFor(() => expect(screen.getByTestId('nearby-map')).toBeTruthy())
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import SpotLocationScreen from '@/features/create/screens/SpotLocationScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

/**
 * The full-screen pin (STOURIFY-257). What the picker itself does is
 * `LocationPicker.test.tsx`'s business; this proves the screen's own job —
 * starting from the form's pin and handing the chosen one back.
 */
const mockMarkerProps: Record<string, any>[] = []

jest.mock('react-native-maps', () => {
  const React = require('react')
  const { View } = require('react-native')

  const MapView = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn() }))
    return React.createElement(View, { testID: 'vendor-map' }, props.children)
  })
  const Marker = (props: any) => {
    mockMarkerProps.push(props)
    return React.createElement(View, { testID: `vendor-marker-${props.identifier}` })
  }

  return { __esModule: true, default: MapView, Marker }
})

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(async () => null),
}))

jest.mock('@/sync/seams/connectivity', () => ({
  netInfoConnectivity: { isOnline: () => true, subscribe: () => () => {} },
}))

import * as Location from 'expo-location'

const permissions = Location.requestForegroundPermissionsAsync as jest.Mock
const navigation = { navigate: jest.fn(), goBack: jest.fn(), popTo: jest.fn() } as any

function renderScreen(coordinate: { latitude: number; longitude: number } | null) {
  render(
    <TestProviders database={createTestDatabase()}>
      <SpotLocationScreen navigation={navigation} route={{ params: { coordinate } } as any} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockMarkerProps.length = 0
})

it('hands the pin it started with back to the form on Confirm', async () => {
  const placed = { latitude: 7.5, longitude: 126.5 }
  renderScreen(placed)

  await waitFor(() => {
    expect(screen.getByTestId('picked-coordinates')).toBeTruthy()
  })
  expect(permissions).not.toHaveBeenCalled()

  fireEvent.press(screen.getByText('Confirm location'))

  expect(navigation.popTo).toHaveBeenCalledWith('CreateSpot', { coordinate: placed })
})

it('hands back where the pin was dropped, not where it started', async () => {
  renderScreen({ latitude: 7.5, longitude: 126.5 })

  await waitFor(() => {
    expect(mockMarkerProps.some((pin) => pin.draggable === true)).toBe(true)
  })

  const moved = { latitude: 7.6, longitude: 126.6 }
  mockMarkerProps
    .filter((pin) => pin.draggable === true)
    .at(-1)!
    .onDragEnd({ nativeEvent: { coordinate: moved } })

  await waitFor(() => {
    expect(screen.getByTestId('picked-coordinates').props.children).toBe('7.60000, 126.60000')
  })

  fireEvent.press(screen.getByText('Confirm location'))

  expect(navigation.popTo).toHaveBeenCalledWith('CreateSpot', { coordinate: moved })
})

it('will not confirm while there is no position at all', () => {
  // Still looking, and nothing handed in: there is nothing to confirm.
  permissions.mockReturnValue(new Promise(() => {}))
  renderScreen(null)

  fireEvent.press(screen.getByText('Confirm location'))

  expect(navigation.popTo).not.toHaveBeenCalled()
})

it('goes back without touching the form', () => {
  renderScreen({ latitude: 7.5, longitude: 126.5 })

  fireEvent.press(screen.getByLabelText('Back'))

  expect(navigation.goBack).toHaveBeenCalled()
  expect(navigation.popTo).not.toHaveBeenCalled()
})

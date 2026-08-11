import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Database } from '@nozbe/watermelondb'
import LocationPicker from '@/features/create/components/LocationPicker'
import { DEFAULT_MAP_CENTER } from '@/features/create/api/mapCenter'
import { createTestDatabase, seedCity, seedExplorerProfile } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'

/**
 * The vendor is mocked, for the same reason `MapCanvas.test.tsx` mocks it: the
 * real thing is a Google native view that jest cannot render, and whether it
 * draws is the emulator gate's question. Here the map is a probe — did the
 * picker mount one, where did it point it, and which pin did it let go of?
 */
const mockMapProps: Record<string, any>[] = []
const mockMarkerProps: Record<string, any>[] = []

jest.mock('react-native-maps', () => {
  const React = require('react')
  const { View } = require('react-native')

  const MapView = React.forwardRef((props: any, ref: any) => {
    mockMapProps.push(props)
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
  getLastKnownPositionAsync: jest.fn(),
}))

/**
 * Connectivity is mocked at the sync seam rather than at the hook that reads it,
 * so `useIsOnline` is exercised rather than replaced.
 */
let mockOnline = true

jest.mock('@/sync/seams/connectivity', () => ({
  netInfoConnectivity: {
    isOnline: () => mockOnline,
    subscribe: () => () => {},
  },
}))

import * as Location from 'expo-location'

const permissions = Location.requestForegroundPermissionsAsync as jest.Mock
const currentPosition = Location.getCurrentPositionAsync as jest.Mock
const lastKnown = Location.getLastKnownPositionAsync as jest.Mock

const FIX = { latitude: 6.1164, longitude: 125.1716 }

function position(coords: { latitude: number; longitude: number; accuracy?: number | null }) {
  return { coords: { ...coords, altitude: null, heading: null, speed: null }, timestamp: 1 }
}

interface PickerHarness {
  value?: { latitude: number; longitude: number } | null
  onChange?: jest.Mock
  database?: Database
}

function renderPicker({ value = null, onChange = jest.fn(), database }: PickerHarness = {}) {
  render(
    <TestProviders database={database ?? createTestDatabase()}>
      <LocationPicker value={value} onChange={onChange} />
    </TestProviders>,
  )

  return { value, onChange }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockMapProps.length = 0
  mockMarkerProps.length = 0
  mockOnline = true
  permissions.mockResolvedValue({ status: 'granted' })
  currentPosition.mockResolvedValue(position({ ...FIX, accuracy: 12.4 }))
  lastKnown.mockResolvedValue(null)
})

describe('LocationPicker — while it is looking', () => {
  it('says it is locating rather than showing an empty frame', async () => {
    // A permission promise that never settles is the real shape of "still
    // looking", and it is also what an emulator with no fix actually does.
    permissions.mockReturnValue(new Promise(() => {}))

    renderPicker()

    expect(screen.getByText(/finding where you are/i)).toBeTruthy()
  })
})

describe('LocationPicker — with a position', () => {
  it('fills the coordinates in for you and reports them upward', async () => {
    const { onChange } = renderPicker()

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(FIX)
    })
  })

  it('shows how accurate the fix is, so a rough one is recognisable as rough', async () => {
    renderPicker()

    await waitFor(() => {
      expect(screen.getByText(/12 m/)).toBeTruthy()
    })
  })

  it('echoes the coordinates back as text you can read but not edit', async () => {
    renderPicker({ value: FIX })

    await waitFor(() => {
      expect(screen.getByTestId('picked-coordinates')).toBeTruthy()
    })

    expect(screen.getByTestId('picked-coordinates').props.children).toEqual(
      expect.stringContaining('6.1164'),
    )
    // Nothing on the picker takes typed input. This is the card's first
    // acceptance line, asserted rather than assumed.
    expect(screen.queryByPlaceholderText(/latitude/i)).toBeNull()
    expect(screen.queryByPlaceholderText(/longitude/i)).toBeNull()
  })

  it('hands the map exactly one movable pin', async () => {
    renderPicker({ value: FIX })

    await waitFor(() => {
      expect(mockMarkerProps.length).toBeGreaterThan(0)
    })

    // De-duplicated by identifier: the mock collects props from every render,
    // so counting entries would measure re-renders rather than pins.
    const movable = new Set(
      mockMarkerProps.filter((pin) => pin.draggable === true).map((pin) => pin.identifier),
    )
    expect(movable.size).toBe(1)
  })

  it('takes the dropped position when the pin is moved', async () => {
    const { onChange } = renderPicker({ value: FIX })

    await waitFor(() => {
      expect(mockMarkerProps.some((pin) => pin.draggable === true)).toBe(true)
    })

    const moved = { latitude: 6.2, longitude: 125.2 }
    mockMarkerProps
      .filter((pin) => pin.draggable === true)
      .at(-1)!
      .onDragEnd({ nativeEvent: { coordinate: moved } })

    expect(onChange).toHaveBeenLastCalledWith(moved)
  })
})

describe('LocationPicker — finding the pin again', () => {
  // The map pans freely, so the pin can end up off screen. Without a way back,
  // the picker reads as a map of somewhere else entirely.
  it('offers a recenter control and points the map back at the pin', async () => {
    const moved = { latitude: 7.5, longitude: 126.5 }
    renderPicker({ value: moved })

    await waitFor(() => {
      expect(screen.getByTestId('map-recenter')).toBeTruthy()
    })

    fireEvent.press(screen.getByTestId('map-recenter'))

    await waitFor(() => {
      expect(mockMapProps.at(-1)!.region.latitude).toBeCloseTo(moved.latitude, 3)
    })
  })
})

describe('LocationPicker — when permission is refused', () => {
  beforeEach(() => {
    permissions.mockResolvedValue({ status: 'denied' })
  })

  it('explains what happened instead of failing silently', async () => {
    renderPicker()

    await waitFor(() => {
      expect(screen.getByText(/location is switched off/i)).toBeTruthy()
    })
  })

  it('still gives a usable map, centred on the home city', async () => {
    const database = createTestDatabase()
    await seedCity(database, { serverId: 7, name: 'Cebu', slug: 'cebu', latitude: 10.3157, longitude: 123.8854 })
    await seedExplorerProfile(database, { homeCityId: 7 })

    renderPicker({ database })

    await waitFor(() => {
      expect(screen.getByTestId('vendor-map')).toBeTruthy()
    })

    await waitFor(() => {
      expect(mockMapProps.at(-1)!.region.latitude).toBeCloseTo(10.3157, 3)
    })
  })

  it('centres on the documented default when there is no home city to use', async () => {
    renderPicker()

    await waitFor(() => {
      expect(mockMapProps.at(-1)!.region.latitude).toBeCloseTo(DEFAULT_MAP_CENTER.latitude, 3)
    })
  })

  it('reports nothing upward on its own — a refused permission is not a position', async () => {
    const { onChange } = renderPicker()

    await waitFor(() => {
      expect(screen.getByText(/location is switched off/i)).toBeTruthy()
    })

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('LocationPicker — when permission is given but no fix arrives', () => {
  it('says the device could not place you, and offers the map anyway', async () => {
    currentPosition.mockResolvedValue(null)
    lastKnown.mockResolvedValue(null)

    renderPicker()

    await waitFor(() => {
      expect(screen.getByText(/couldn't work out where you are/i)).toBeTruthy()
    })

    expect(screen.getByTestId('vendor-map')).toBeTruthy()
  })

  it('settles for the last known position when the live one never comes', async () => {
    currentPosition.mockRejectedValue(new Error('no signal'))
    lastKnown.mockResolvedValue(position({ latitude: 1.5, longitude: 2.5, accuracy: null }))

    const { onChange } = renderPicker()

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ latitude: 1.5, longitude: 2.5 })
    })
  })
})

describe('LocationPicker — offline', () => {
  it('keeps the map and says why the imagery is missing', async () => {
    mockOnline = false

    renderPicker({ value: FIX })

    await waitFor(() => {
      expect(screen.getByText(/map images will fill in/i)).toBeTruthy()
    })

    // The map itself stays: dropping a pin needs no tiles, and losing the map
    // would remove the only way to correct a position offline.
    expect(screen.getByTestId('vendor-map')).toBeTruthy()
  })

  it('says nothing about tiles while the device is online', async () => {
    renderPicker({ value: FIX })

    await waitFor(() => {
      expect(screen.getByTestId('vendor-map')).toBeTruthy()
    })

    expect(screen.queryByText(/map images will fill in/i)).toBeNull()
  })
})

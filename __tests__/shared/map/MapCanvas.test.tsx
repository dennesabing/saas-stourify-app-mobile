import { render, fireEvent } from '@testing-library/react-native'
import { Text as RNText } from 'react-native'
import MapCanvas from '@/shared/map/MapCanvas'
import type { MapPin } from '@/shared/map/types'

/**
 * The vendor is mocked, deliberately.
 *
 * These tests are about the seam — that app vocabulary (a region in kilometres,
 * pins with a semantic kind, a selected pin) is translated into whatever the
 * engine wants. Rendering the real `react-native-maps` would test Google's
 * native view instead, which jest cannot do and which is the emulator gate's
 * job anyway.
 */

const mockMapProps: Record<string, any>[] = []
const mockMarkerProps: Record<string, any>[] = []
const mockAnimateToRegion = jest.fn()

jest.mock('react-native-maps', () => {
  const React = require('react')
  const { TouchableOpacity, View } = require('react-native')

  const MapView = React.forwardRef((props: any, ref: any) => {
    mockMapProps.push(props)
    React.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimateToRegion }))
    return React.createElement(
      TouchableOpacity,
      { testID: 'vendor-map', onPress: props.onPress },
      props.children,
    )
  })

  const Marker = (props: any) => {
    mockMarkerProps.push(props)
    return React.createElement(TouchableOpacity, {
      testID: `vendor-marker-${props.identifier}`,
      onPress: props.onPress,
      children: React.createElement(View, {}),
    })
  }

  return { __esModule: true, default: MapView, Marker }
})

const HERE = { latitude: 14.5995, longitude: 120.9842 }

const PINS: MapPin[] = [
  { id: 'spot-a', coordinate: { latitude: 14.61, longitude: 120.99 }, title: 'Fort Santiago', kind: 'spot' },
  { id: 'spot-b', coordinate: { latitude: 14.58, longitude: 120.97 }, title: 'Rizal Park', kind: 'spot' },
  { id: 'me', coordinate: HERE, title: 'You', kind: 'you' },
]

function lastMapProps() {
  return mockMapProps[mockMapProps.length - 1]
}

beforeEach(() => {
  mockMapProps.length = 0
  mockMarkerProps.length = 0
  mockAnimateToRegion.mockClear()
})

describe('MapCanvas — the region seam', () => {
  it('takes a radius in kilometres and never asks the caller for degree deltas', () => {
    render(<MapCanvas region={{ center: HERE, radiusKm: 10 }} pins={[]} />)

    const region = lastMapProps().region
    expect(region.latitude).toBe(HERE.latitude)
    expect(region.longitude).toBe(HERE.longitude)
    // 10 km each way ≈ 20 km of latitude ≈ 0.18°.
    expect(region.latitudeDelta).toBeCloseTo(0.1796, 3)
  })

  it('widens the span as the radius grows', () => {
    const { rerender } = render(<MapCanvas region={{ center: HERE, radiusKm: 5 }} pins={[]} />)
    const tight = lastMapProps().region.latitudeDelta

    rerender(<MapCanvas region={{ center: HERE, radiusKm: 50 }} pins={[]} />)
    const wide = lastMapProps().region.latitudeDelta

    expect(wide).toBeGreaterThan(tight * 5)
  })

  it('corrects longitude for latitude, so a circle is not squashed near the poles', () => {
    render(<MapCanvas region={{ center: { latitude: 60, longitude: 10 }, radiusKm: 10 }} pins={[]} />)

    const region = lastMapProps().region
    expect(region.longitudeDelta).toBeGreaterThan(region.latitudeDelta * 1.9)
  })
})

describe('MapCanvas — pins', () => {
  it('renders one marker per pin, keyed by the app-supplied id', () => {
    const { getByTestId } = render(<MapCanvas region={{ center: HERE, radiusKm: 10 }} pins={PINS} />)

    expect(getByTestId('vendor-marker-spot-a')).toBeTruthy()
    expect(getByTestId('vendor-marker-spot-b')).toBeTruthy()
    expect(getByTestId('vendor-marker-me')).toBeTruthy()
  })

  it('resolves the pin kind to a colour itself — callers never name one', () => {
    render(<MapCanvas region={{ center: HERE, radiusKm: 10 }} pins={PINS} />)

    const spot = mockMarkerProps.find((p) => p.identifier === 'spot-a')
    const you = mockMarkerProps.find((p) => p.identifier === 'me')

    expect(typeof spot!.pinColor).toBe('string')
    expect(spot!.pinColor).not.toBe(you!.pinColor)
  })

  it('passes the pin title through as the marker title', () => {
    render(<MapCanvas region={{ center: HERE, radiusKm: 10 }} pins={PINS} />)

    expect(mockMarkerProps.find((p) => p.identifier === 'spot-a')!.title).toBe('Fort Santiago')
  })
})

describe('MapCanvas — selection', () => {
  it('reports the pin id when a pin is tapped', () => {
    const onSelectPin = jest.fn()
    const { getByTestId } = render(
      <MapCanvas region={{ center: HERE, radiusKm: 10 }} pins={PINS} onSelectPin={onSelectPin} />,
    )

    fireEvent.press(getByTestId('vendor-marker-spot-b'))

    expect(onSelectPin).toHaveBeenCalledWith('spot-b')
  })

  it('clears the selection when the already-selected pin is tapped again', () => {
    const onSelectPin = jest.fn()
    const { getByTestId } = render(
      <MapCanvas
        region={{ center: HERE, radiusKm: 10 }}
        pins={PINS}
        selectedPinId="spot-b"
        onSelectPin={onSelectPin}
      />,
    )

    fireEvent.press(getByTestId('vendor-marker-spot-b'))

    expect(onSelectPin).toHaveBeenCalledWith(null)
  })

  it('clears the selection when the map itself is tapped', () => {
    const onSelectPin = jest.fn()
    const { getByTestId } = render(
      <MapCanvas
        region={{ center: HERE, radiusKm: 10 }}
        pins={PINS}
        selectedPinId="spot-a"
        onSelectPin={onSelectPin}
      />,
    )

    fireEvent.press(getByTestId('vendor-map'))

    expect(onSelectPin).toHaveBeenCalledWith(null)
  })
})

describe('MapCanvas — the peek card', () => {
  const renderPeekCard = (pin: MapPin) => <RNText>Peeking at {pin.title}</RNText>

  it('renders nothing while no pin is selected', () => {
    const { queryByText } = render(
      <MapCanvas region={{ center: HERE, radiusKm: 10 }} pins={PINS} renderPeekCard={renderPeekCard} />,
    )

    expect(queryByText(/Peeking at/)).toBeNull()
  })

  it('renders the caller-supplied content for the selected pin', () => {
    const { getByText } = render(
      <MapCanvas
        region={{ center: HERE, radiusKm: 10 }}
        pins={PINS}
        selectedPinId="spot-a"
        renderPeekCard={renderPeekCard}
      />,
    )

    expect(getByText('Peeking at Fort Santiago')).toBeTruthy()
  })

  it('renders nothing when the selected id matches no pin', () => {
    const { queryByText } = render(
      <MapCanvas
        region={{ center: HERE, radiusKm: 10 }}
        pins={PINS}
        selectedPinId="a-pin-that-was-removed"
        renderPeekCard={renderPeekCard}
      />,
    )

    expect(queryByText(/Peeking at/)).toBeNull()
  })
})

describe('MapCanvas — recenter', () => {
  it('draws no control unless the caller wants one', () => {
    const { queryByTestId } = render(<MapCanvas region={{ center: HERE, radiusKm: 10 }} pins={PINS} />)

    expect(queryByTestId('map-recenter')).toBeNull()
  })

  it('moves the map back to the region centre and tells the caller', () => {
    const onRecenter = jest.fn()
    const { getByTestId } = render(
      <MapCanvas region={{ center: HERE, radiusKm: 10 }} pins={PINS} onRecenter={onRecenter} />,
    )

    fireEvent.press(getByTestId('map-recenter'))

    expect(onRecenter).toHaveBeenCalledTimes(1)
    expect(mockAnimateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: HERE.latitude, longitude: HERE.longitude }),
      expect.any(Number),
    )
  })
})

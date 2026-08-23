import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Text from '@/shared/components/ui/Text'
import { useTheme } from '@/theme/ThemeProvider'
import type { MapCoordinate, MapPin, MapPinKind, MapRegion } from './types'

/**
 * The only map-aware file in the app.
 *
 * Every other file speaks the vocabulary in `./types` — pins, a selected pin, a
 * peek card, a recenter, a region in kilometres. This file is the single place
 * that knows those become `<Marker>`s, a `latitudeDelta` and an
 * `animateToRegion`, so replacing `react-native-maps` with MapLibre post-beta
 * (offline map packs — the flagship Pro feature) is a change to this file and
 * to nothing else.
 *
 * `__tests__/shared/map/vendorIsolation.test.ts` enforces that, because a
 * boundary nobody checks is a boundary that lasts one milestone.
 */

/** Degrees of latitude per kilometre. Constant everywhere; longitude is not. */
const KM_PER_LATITUDE_DEGREE = 111.32

/**
 * Longitude degrees shrink towards the poles, so a naive square region renders
 * as a squashed one. Clamped because the correction diverges at the pole and a
 * map of the whole planet is not a useful failure mode.
 */
const MAX_LONGITUDE_STRETCH = 8

export interface MapCanvasProps {
  /** Where to look, and how wide. Kilometres — never degrees, never a zoom level. */
  region: MapRegion
  pins: MapPin[]
  /** Controlled: the owner holds selection state, exactly like a form input. */
  selectedPinId?: string | null
  /** Called with a pin id on tap, and with `null` when the selection is cleared. */
  onSelectPin?: (pinId: string | null) => void
  /**
   * Content to float over the map for the selected pin. The wrapper owns *when*
   * a peek card shows; the caller owns what is in it.
   */
  renderPeekCard?: (pin: MapPin) => ReactNode
  /**
   * Supply this to get a recenter control. Pressing it returns the map to
   * `region.center` and then calls back, so the caller can re-fetch or reset
   * its own state.
   */
  onRecenter?: () => void
  /**
   * The one pin the viewer may pick up and put down somewhere else. Everything
   * else on the map stays where it is.
   *
   * Deliberately one id rather than a flag on `MapPin`: a screen that can move
   * two pins at once has to explain which is which, and no screen needs that
   * yet. `CreateSpotScreen` moves the spot it is creating and nothing else.
   */
  movablePinId?: string | null
  /**
   * Called with the pin's id and where it was dropped — an app coordinate, not
   * the engine's event. Without this the pin is not movable, however
   * `movablePinId` is set: a pin that can be dragged and reports nowhere loses
   * the position silently.
   */
  onMovePin?: (pinId: string, coordinate: MapCoordinate) => void
  style?: StyleProp<ViewStyle>
  testID?: string
}

function toVendorRegion({ center, radiusKm }: MapRegion) {
  const latitudeDelta = (radiusKm * 2) / KM_PER_LATITUDE_DEGREE
  const shrink = Math.cos((center.latitude * Math.PI) / 180)
  const stretch = Math.min(1 / Math.max(shrink, 0.0001), MAX_LONGITUDE_STRETCH)

  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta,
    longitudeDelta: latitudeDelta * stretch,
  }
}

export default function MapCanvas({
  region,
  pins,
  selectedPinId = null,
  onSelectPin,
  renderPeekCard,
  onRecenter,
  movablePinId = null,
  onMovePin,
  style,
  testID,
}: MapCanvasProps) {
  const theme = useTheme()
  // The map draws edge to edge, so the recenter control needs the inset the
  // screen does not give it. Without this the status bar covers all but a few
  // pixels of a 44dp target and the control is, in practice, unpressable —
  // found on the emulator, not by reading the code.
  const insets = useSafeAreaInsets()
  const mapRef = useRef<MapView | null>(null)

  const vendorRegion = useMemo(() => toVendorRegion(region), [region])

  /** Kind → colour is resolved here so no screen ever names a colour. */
  const pinColorFor = useCallback(
    (kind: MapPinKind) => (kind === 'you' ? theme.colors.primary : theme.colors.accent),
    [theme],
  )

  const handlePinPress = useCallback(
    (pinId: string) => onSelectPin?.(pinId === selectedPinId ? null : pinId),
    [onSelectPin, selectedPinId],
  )

  /**
   * The engine hands over its own event object. It stops here — every caller
   * above sees a `MapCoordinate` and nothing else.
   *
   * A drop with no coordinate is dropped rather than reported: the engine has
   * been observed to fire drag callbacks with an empty payload, and forwarding
   * that would move the spot to `(undefined, undefined)` — which reads
   * downstream as a validation failure on a position the user never chose.
   */
  const handleDragEnd = useCallback(
    (pinId: string, event: { nativeEvent?: { coordinate?: MapCoordinate } }) => {
      const coordinate = event?.nativeEvent?.coordinate
      if (
        !coordinate ||
        typeof coordinate.latitude !== 'number' ||
        typeof coordinate.longitude !== 'number'
      ) {
        return
      }

      onMovePin?.(pinId, { latitude: coordinate.latitude, longitude: coordinate.longitude })
    },
    [onMovePin],
  )

  const handleRecenter = useCallback(() => {
    mapRef.current?.animateToRegion(vendorRegion, theme.motion.base)
    onRecenter?.()
  }, [onRecenter, theme.motion.base, vendorRegion])

  const selectedPin = selectedPinId ? pins.find((pin) => pin.id === selectedPinId) : undefined

  return (
    <View style={[styles.container, style]} testID={testID}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        region={vendorRegion}
        onPress={() => onSelectPin?.(null)}
      >
        {pins.map((pin) => {
          const movable = onMovePin !== undefined && pin.id === movablePinId

          return (
            <Marker
              key={pin.id}
              identifier={pin.id}
              coordinate={pin.coordinate}
              title={pin.title}
              pinColor={pinColorFor(pin.kind)}
              draggable={movable}
              onDragEnd={movable ? (event: any) => handleDragEnd(pin.id, event) : undefined}
              onPress={() => handlePinPress(pin.id)}
            />
          )
        })}
      </MapView>

      {onRecenter ? (
        <TouchableOpacity
          testID="map-recenter"
          accessibilityRole="button"
          accessibilityLabel="Recenter the map"
          onPress={handleRecenter}
          style={[
            styles.recenter,
            {
              top: insets.top + theme.spacing[3],
              right: theme.spacing[3],
              width: theme.minTouchTarget,
              height: theme.minTouchTarget,
              borderRadius: theme.radius.chip,
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.hairline,
              ...theme.elevation.raised,
            },
          ]}
        >
          <Text variant="body" color="primary">
            ◎
          </Text>
        </TouchableOpacity>
      ) : null}

      {selectedPin && renderPeekCard ? (
        <View
          testID="map-peek-card"
          pointerEvents="box-none"
          style={[
            styles.peek,
            { left: theme.gutter, right: theme.gutter, bottom: theme.spacing[3] },
          ]}
        >
          {renderPeekCard(selectedPin)}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  recenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  peek: { position: 'absolute' },
})

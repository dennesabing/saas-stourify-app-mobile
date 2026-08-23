import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useDatabase } from '@nozbe/watermelondb/react'
import { Button, Text } from '@/shared/components/ui'
import { useIsOnline } from '@/shared/hooks/useIsOnline'
import { MapCanvas, readFallbackCenter, type MapCoordinate, type MapPin } from '@/shared/map'
import { requestPosition } from '@/shared/location/position'
import { useTheme } from '@/theme/ThemeProvider'

/**
 * Where the spot is, captured rather than typed.
 *
 * The phone answers first — it usually knows within a few metres — and the map
 * is there for the times it is wrong. Dragging the pin is the correction: like
 * moving a sticker on a paper map, it cannot produce a coordinate that is not a
 * real place, which two number fields very much can.
 *
 * Three things about the shape of this component are load-bearing.
 *
 * **It never names a map library.** It talks to `@/shared/map`, the single
 * map-aware seam, and `__tests__/shared/map/vendorIsolation.test.ts` fails the
 * build if that stops being true. The whole reason is replaceability: MapLibre
 * takes over after the beta, for offline map packs, and that is a one-file
 * change only while one file knows what is installed.
 *
 * **The map's centre is not the pin.** They are set together when a fix arrives
 * and then move independently: re-centring on every drag would yank the map out
 * from under the finger doing the dragging.
 *
 * **A refusal and a silence are different states.** "You said no to location"
 * and "location is on and produced nothing" need different sentences, and
 * collapsing them is the exact bug STOURIFY-20 had to undo on the Nearby screen.
 */

/** How much ground the picker shows. Tight enough to place a pin precisely. */
const PICKER_RADIUS_KM = 1

/** Only one pin exists here, so its id is a constant rather than a spot uuid. */
const PICK_PIN_ID = 'spot-being-created'

type PickerStatus = 'locating' | 'ready' | 'denied' | 'unavailable'

export interface LocationPickerProps {
  /** The chosen coordinate, or `null` while none has been chosen. */
  value: MapCoordinate | null
  onChange: (coordinate: MapCoordinate) => void
}

export default function LocationPicker({ value, onChange }: LocationPickerProps) {
  const theme = useTheme()
  const database = useDatabase()
  const online = useIsOnline()

  const [status, setStatus] = useState<PickerStatus>('locating')
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Held as two numbers rather than one object so the region below keeps a
  // stable identity across re-renders. A fresh region object every render makes
  // the map re-seat its camera, which shows up as a twitch on every keystroke
  // elsewhere on the form.
  const [centerLat, setCenterLat] = useState<number | null>(null)
  const [centerLng, setCenterLng] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function locate(): Promise<void> {
      // Worked out first and unconditionally: it is a local database read, and
      // every path that is not a clean fix needs somewhere to point the map.
      const fallback = await readFallbackCenter(database)
      const result = await requestPosition()
      if (cancelled) return

      if (result.status === 'denied') {
        setCenterLat(fallback.latitude)
        setCenterLng(fallback.longitude)
        setStatus('denied')
        return
      }

      if (result.fix === null) {
        setCenterLat(fallback.latitude)
        setCenterLng(fallback.longitude)
        setStatus('unavailable')
        return
      }

      setCenterLat(result.fix.coordinate.latitude)
      setCenterLng(result.fix.coordinate.longitude)
      setAccuracyMeters(result.fix.accuracyMeters)
      setStatus('ready')
      onChange(result.fix.coordinate)
    }

    setStatus('locating')
    void locate()

    return () => {
      cancelled = true
    }
    // `onChange` is deliberately not a dependency: a caller that re-creates it
    // every render would otherwise re-request the position on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, attempt])

  const region = useMemo(
    () => ({
      center: { latitude: centerLat ?? 0, longitude: centerLng ?? 0 },
      radiusKm: PICKER_RADIUS_KM,
    }),
    [centerLat, centerLng],
  )

  const pinCoordinate =
    value ??
    (centerLat !== null && centerLng !== null
      ? { latitude: centerLat, longitude: centerLng }
      : null)

  const pins = useMemo<MapPin[]>(
    () =>
      pinCoordinate === null
        ? []
        : [{ id: PICK_PIN_ID, coordinate: pinCoordinate, kind: 'spot', title: 'This spot' }],
    [pinCoordinate?.latitude, pinCoordinate?.longitude], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const mapReady = centerLat !== null && centerLng !== null

  /**
   * Bring the pin back into view.
   *
   * The map can be panned freely — that is how you look around before placing
   * the pin — and panning far enough leaves the pin off screen with nothing to
   * say where it went. Found on the emulator, not by reading the code: pan twice
   * and the picker looks like an ordinary map of somewhere else.
   *
   * The wrapper's own control animates to the region's centre first and then
   * calls this, so after a drag the map settles in two steps rather than one.
   * That is accepted: the alternative is the region following the pin on every
   * drag, which yanks the map out from under the finger doing the dragging.
   */
  const recenterOnPin = () => {
    if (pinCoordinate === null) return
    setCenterLat(pinCoordinate.latitude)
    setCenterLng(pinCoordinate.longitude)
  }

  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="h2">Where is it?</Text>

      {status === 'locating' && !mapReady ? (
        <View
          testID="location-picker-locating"
          style={[
            styles.frame,
            styles.centered,
            { borderRadius: theme.radius.button, backgroundColor: theme.colors.surfaceAlt },
          ]}
        >
          <ActivityIndicator color={theme.colors.primary} />
          <Text variant="caption" color="muted">
            Finding where you are…
          </Text>
        </View>
      ) : null}

      {mapReady ? (
        <View style={[styles.frame, { borderRadius: theme.radius.button, overflow: 'hidden' }]}>
          <MapCanvas
            testID="location-picker-map"
            region={region}
            pins={pins}
            movablePinId={PICK_PIN_ID}
            onMovePin={(_pinId, coordinate) => onChange(coordinate)}
            onRecenter={recenterOnPin}
          />
        </View>
      ) : null}

      {status === 'locating' ? null : (
        <Text variant="caption" color="muted">
          {explain(status)}
        </Text>
      )}

      {status === 'ready' && accuracyMeters !== null ? (
        <Text variant="caption" color="muted">
          {`Accurate to about ${Math.max(1, Math.round(accuracyMeters))} m.`}
        </Text>
      ) : null}

      {!online ? (
        <Text variant="caption" color="muted">
          No signal, so the map images will fill in once you are back online. Placing the pin works
          without them.
        </Text>
      ) : null}

      {value !== null ? (
        <Text testID="picked-coordinates" variant="caption" color="muted">
          {`${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`}
        </Text>
      ) : null}

      {status === 'unavailable' || status === 'denied' ? (
        <Button
          label="Try locating me again"
          variant="secondary"
          onPress={() => setAttempt((n) => n + 1)}
          accessibilityLabel="Try locating me again"
          fullWidth
        />
      ) : null}
    </View>
  )
}

/**
 * One sentence per state. Written as a plain function so the wording is one
 * lookup rather than a chain of ternaries buried in the markup.
 */
function explain(status: PickerStatus): string {
  switch (status) {
    case 'locating':
      return 'Finding where you are…'
    case 'ready':
      return 'Taken from your phone. Drag the pin if it is not quite right.'
    case 'denied':
      return 'Location is switched off for Stourify, so we could not fill this in. Drag the pin to where the spot is.'
    case 'unavailable':
      return "We couldn't work out where you are. Drag the pin to where the spot is."
  }
}

const styles = StyleSheet.create({
  frame: { height: 240 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 8 },
})

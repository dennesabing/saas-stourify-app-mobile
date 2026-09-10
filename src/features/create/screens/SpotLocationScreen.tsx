import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Icon } from '@/shared/components/ui'
import type { CreateStackParamList } from '@/shared/navigation/types'
import type { MapCoordinate } from '@/shared/map'
import LocationPicker from '@/features/create/components/LocationPicker'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<CreateStackParamList, 'SpotLocation'>

/** The floating back disc over the map. */
const BACK_SIZE = 40

/**
 * The full-screen pin (STOURIFY-257, artboard 5 of the Create design).
 *
 * The map fills the screen and the pin drags, exactly as the inline picker did
 * before; what changed is only where it lives. "Confirm location" hands the pin
 * back to the form with `popTo`, and Back leaves the form's position untouched.
 *
 * `popTo`, not `navigate`, for the reason `PhotoReviewScreen` records: React
 * Navigation 7's `navigate` pushes a fresh, empty form instead of returning to
 * the one with the title already typed into it.
 *
 * Left out of the artboard on purpose: address search and the nearby-places
 * list. Both need a geocoding service, and this screen has to work with no
 * signal, because that is when people most need to drop a pin.
 */
export default function SpotLocationScreen({ navigation, route }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [coordinate, setCoordinate] = useState<MapCoordinate | null>(route.params.coordinate)

  // Stable, so the picker does not re-request a position on every render.
  const onChange = useCallback((next: MapCoordinate) => setCoordinate(next), [])

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <LocationPicker
        value={coordinate}
        onChange={onChange}
        footer={
          <Button
            label="Confirm location"
            size="lg"
            disabled={coordinate === null}
            onPress={() => {
              if (coordinate !== null) navigation.popTo('CreateSpot', { coordinate })
            }}
            fullWidth
          />
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => navigation.goBack()}
        hitSlop={(theme.minTouchTarget - BACK_SIZE) / 2}
        style={({ pressed }) => [
          styles.back,
          theme.elevation.floating,
          {
            top: insets.top + theme.spacing[3],
            left: theme.gutter,
            backgroundColor: theme.colors.card,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Icon name="back" size={20} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  back: {
    position: 'absolute',
    width: BACK_SIZE,
    height: BACK_SIZE,
    borderRadius: BACK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

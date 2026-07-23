import { useFonts } from 'expo-font'
import {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces'
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'

/**
 * Loads the two families the design system is built on.
 *
 * Returns `true` once they are ready. The app renders regardless — a blocked
 * splash on a slow device is worse than one frame of system font — but text
 * styles reference these families by name, so anything rendered before they
 * load falls back to the platform default rather than breaking.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  })

  return loaded || error !== null
}

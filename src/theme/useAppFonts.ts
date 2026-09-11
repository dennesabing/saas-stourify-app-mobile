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
 *
 * On Android this is no longer what makes the fonts available: the build copies
 * the same files into the APK (android/app/build.gradle → bundledFonts), so
 * they resolve on the first frame. Loading them here too is harmless there and
 * is still how iOS gets them. Add a font here and you must add it to that list
 * too — __tests__/android/bundledFonts.test.ts checks.
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

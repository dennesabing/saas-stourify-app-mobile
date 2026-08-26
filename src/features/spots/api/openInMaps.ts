import { Linking, Platform } from 'react-native'

/**
 * Open a coordinate in whatever map app the phone has.
 *
 * ## Why the device's map rather than the one inside the app
 *
 * The app does have a map — but it lives on the Discover tab, it shows every
 * spot rather than this one, and the spot page is rendered inside four
 * different navigators, only one of which can reach it. Navigating there would
 * be a lot of plumbing to arrive somewhere less useful.
 *
 * The device's map is what a coordinate is *for*. It knows where you are, it
 * can give you directions, and it is the app the reader already uses for
 * exactly this.
 *
 * ## Why two URLs
 *
 * `geo:` is the standard way to hand a coordinate to a map app, and on Android
 * it offers the reader whichever ones they have. It also fails outright on a
 * device with no map app installed, which is rare but real — and `Linking`
 * rejects rather than doing nothing, so an unhandled rejection would be the
 * result of tapping a label.
 *
 * The https fallback always resolves: a map app that claims those links takes
 * it, and otherwise the browser does. So the order is "the good answer, then
 * the answer that always works".
 *
 * `label` rides along so the pin is named rather than being a bare dot, and it
 * is URL-encoded because spot names contain spaces, ampersands and apostrophes.
 */
export async function openInMaps(
  latitude: number,
  longitude: number,
  label?: string | null,
): Promise<void> {
  const coords = `${latitude},${longitude}`
  const name = encodeURIComponent(label?.trim() || 'Spot')

  // iOS reads `ll=` and treats `q` as the pin's name; Android takes the
  // coordinate in the path and `q` as a search. They are different enough that
  // one string cannot serve both.
  const geo =
    Platform.OS === 'ios' ? `maps:0,0?q=${name}@${coords}` : `geo:${coords}?q=${coords}(${name})`

  try {
    await Linking.openURL(geo)
    return
  } catch {
    // No map app, or one that does not claim the scheme. Fall through.
  }

  try {
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${coords}`)
  } catch {
    // Nothing on this device can open a link at all. Doing nothing is the only
    // remaining option, and it beats an unhandled rejection from a label tap.
  }
}

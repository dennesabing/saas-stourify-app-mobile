import { Linking, Platform } from 'react-native'
import { openInMaps } from '@/features/spots/api/openInMaps'

/**
 * STOURIFY-210 — tapping where a spot is opens the device's map app.
 *
 * The device's map rather than the one inside the app: ours lives on the
 * Discover tab, shows every spot rather than this one, and the spot page is
 * rendered inside four navigators of which only one could reach it. The
 * device's map knows where the reader is and can give them directions, which is
 * what a coordinate is for.
 */
/**
 * One spy, cleared before every case, and the platform pinned.
 *
 * Set up per-test rather than inline: `jest.spyOn` returns the SAME spy when a
 * method is already spied, so recorded calls leak from one case into the next
 * and `mock.calls[0]` quietly becomes a previous test's URL. And `Platform.OS`
 * is whatever the jest preset decided, so a test that does not pin it is
 * asserting about a platform it did not choose.
 */
let openURL: jest.SpyInstance

beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never)
  openURL.mockClear()
  Platform.OS = 'android'
})

afterEach(() => {
  openURL.mockRestore()
})

it('hands the coordinate to a map app', async () => {
  await openInMaps(6.1164, 125.1716, 'Blue Cove')

  expect(openURL).toHaveBeenCalledTimes(1)
  expect(openURL.mock.calls[0][0]).toContain('6.1164,125.1716')
})

it('names the pin, escaped, so a spot with a space or an ampersand still opens', async () => {
  await openInMaps(1, 2, 'Fish & Chips By The Sea')

  const url = openURL.mock.calls[0][0]
  expect(url).toContain('Fish%20%26%20Chips')
  // A raw space or ampersand would truncate the URL at the map app's parser.
  expect(url).not.toContain('Fish & Chips')
})

/**
 * `geo:` is the right way to hand over a coordinate and it fails outright on a
 * device with no map app. `Linking.openURL` REJECTS rather than doing nothing,
 * so without this fallback an unhandled rejection would be the result of
 * tapping a label.
 */
it('falls back to a web map when nothing claims the map scheme', async () => {
  openURL.mockRejectedValueOnce(new Error('no activity found'))

  await openInMaps(6.1164, 125.1716, 'Blue Cove')

  expect(openURL).toHaveBeenCalledTimes(2)
  expect(openURL.mock.calls[1][0]).toContain('https://www.google.com/maps')
  expect(openURL.mock.calls[1][0]).toContain('6.1164,125.1716')
})

it('gives up quietly when the device can open nothing at all', async () => {
  openURL.mockRejectedValue(new Error('nope'))

  // Tapping a label must never produce an unhandled rejection.
  await expect(openInMaps(1, 2, 'Anywhere')).resolves.toBeUndefined()
})

it('uses the scheme the platform actually understands', async () => {
  await openInMaps(1, 2, 'A')
  expect(openURL.mock.calls[0][0].startsWith('geo:')).toBe(true)

  openURL.mockClear()
  Platform.OS = 'ios'
  await openInMaps(1, 2, 'A')
  // iOS reads `ll=`/`q=` and does not handle `geo:`; one string cannot serve both.
  expect(openURL.mock.calls[0][0].startsWith('maps:')).toBe(true)
})

it('falls back to a usable name when the spot has none', async () => {
  await openInMaps(1, 2, '   ')

  expect(openURL.mock.calls[0][0]).toContain('Spot')
})

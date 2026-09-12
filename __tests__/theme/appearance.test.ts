import AsyncStorage from '@react-native-async-storage/async-storage'
import { Appearance } from 'react-native'
import { APPEARANCE_KEY, useAppearanceStore } from '@/theme/appearance'

// Android's night-mode switch, stood in for. The native module does not exist
// under jest, and the thing worth asserting is WHAT the app asks Android for:
// 'light' or 'dark' pins the app, and null hands the decision back to the phone
// (React Native sends that on as 'unspecified', which Android reads as "follow
// the system" — STOURIFY-290's spec traces it through the installed source).
jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  getColorScheme: jest.fn(() => null),
  setColorScheme: jest.fn(),
  addChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}))

const setColorScheme = Appearance.setColorScheme as jest.Mock

beforeEach(async () => {
  await AsyncStorage.clear()
  useAppearanceStore.setState({ choice: 'system' })
  jest.clearAllMocks()
})

test('starts on System, so a fresh install behaves exactly as it did before', () => {
  expect(useAppearanceStore.getState().choice).toBe('system')
})

test('a launch with nothing saved stays on System and leaves the phone in charge', async () => {
  await useAppearanceStore.getState().loadFromStorage()

  expect(useAppearanceStore.getState().choice).toBe('system')
  expect(setColorScheme).toHaveBeenCalledWith(null)
})

test.each(['light', 'dark'] as const)(
  'choosing %s applies it at once and saves it',
  async (choice) => {
    await useAppearanceStore.getState().choose(choice)

    expect(useAppearanceStore.getState().choice).toBe(choice)
    expect(setColorScheme).toHaveBeenCalledWith(choice)
    expect(await AsyncStorage.getItem(APPEARANCE_KEY)).toBe(choice)
  },
)

test('choosing System hands the decision back to the phone', async () => {
  await useAppearanceStore.getState().choose('dark')
  await useAppearanceStore.getState().choose('system')

  expect(useAppearanceStore.getState().choice).toBe('system')
  expect(setColorScheme).toHaveBeenLastCalledWith(null)
  expect(await AsyncStorage.getItem(APPEARANCE_KEY)).toBe('system')
})

test('the choice survives a restart', async () => {
  await useAppearanceStore.getState().choose('dark')

  // A fresh launch: memory resets, the phone's storage does not.
  useAppearanceStore.setState({ choice: 'system' })
  jest.clearAllMocks()
  await useAppearanceStore.getState().loadFromStorage()

  expect(useAppearanceStore.getState().choice).toBe('dark')
  expect(setColorScheme).toHaveBeenCalledWith('dark')
})

test('a saved value it does not recognise counts as System', async () => {
  await AsyncStorage.setItem(APPEARANCE_KEY, 'purple')

  await useAppearanceStore.getState().loadFromStorage()

  expect(useAppearanceStore.getState().choice).toBe('system')
  expect(setColorScheme).toHaveBeenCalledWith(null)
})

test('a storage failure counts as System rather than holding up the launch', async () => {
  // The launch gate waits on this read. A read that threw would keep the
  // splash up forever, which is far worse than the wrong colours for once.
  jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk unavailable'))

  await expect(useAppearanceStore.getState().loadFromStorage()).resolves.toBeUndefined()
  expect(useAppearanceStore.getState().choice).toBe('system')
})

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useOnboardingStore } from '../../src/shared/store/onboarding'

beforeEach(async () => {
  await AsyncStorage.clear()
  useOnboardingStore.setState({ shouldOnboard: false, completed: null })
})

test('markRegistered flips shouldOnboard in memory, without touching storage', async () => {
  useOnboardingStore.getState().markRegistered()
  expect(useOnboardingStore.getState().shouldOnboard).toBe(true)
  expect(await AsyncStorage.getItem('stourify_onboarding_completed')).toBeNull()
})

test('loadFromStorage resolves completed=false when the flag was never written', async () => {
  await useOnboardingStore.getState().loadFromStorage()
  expect(useOnboardingStore.getState().completed).toBe(false)
})

test('complete persists the flag and clears shouldOnboard', async () => {
  useOnboardingStore.getState().markRegistered()

  await useOnboardingStore.getState().complete()

  expect(await AsyncStorage.getItem('stourify_onboarding_completed')).toBe('true')
  expect(useOnboardingStore.getState().completed).toBe(true)
  expect(useOnboardingStore.getState().shouldOnboard).toBe(false)
})

test('does not replay on the next launch — a fresh in-memory store still reads completed=true', async () => {
  await useOnboardingStore.getState().complete()

  // Simulate a fresh app launch: in-memory state resets, AsyncStorage does not.
  useOnboardingStore.setState({ shouldOnboard: false, completed: null })
  await useOnboardingStore.getState().loadFromStorage()

  expect(useOnboardingStore.getState().completed).toBe(true)
  expect(useOnboardingStore.getState().shouldOnboard).toBe(false)
})

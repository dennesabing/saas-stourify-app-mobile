import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

const COMPLETED_KEY = 'stourify_onboarding_completed'

interface OnboardingState {
  /**
   * Set true ONLY by `RegisterScreen` on a successful registration, and only
   * in memory. An ordinary login never sets it, and it resets to `false` on
   * every fresh app launch — which is what keeps onboarding from ever
   * triggering off a login, with no flag to check for that case at all.
   */
  shouldOnboard: boolean
  /** `null` until `loadFromStorage` resolves — `RootNavigator` holds the splash on that. */
  completed: boolean | null
  markRegistered: () => void
  loadFromStorage: () => Promise<void>
  /** Persists the flag so a later app launch — even one that re-sets `shouldOnboard` — never replays it. */
  complete: () => Promise<void>
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  shouldOnboard: false,
  completed: null,

  markRegistered: () => set({ shouldOnboard: true }),

  loadFromStorage: async () => {
    const raw = await AsyncStorage.getItem(COMPLETED_KEY)
    set({ completed: raw === 'true' })
  },

  complete: async () => {
    await AsyncStorage.setItem(COMPLETED_KEY, 'true')
    set({ completed: true, shouldOnboard: false })
  },
}))

import { Appearance } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

/**
 * Settings → Appearance: follow the phone, or keep the app light or dark
 * whatever the phone is set to (STOURIFY-290).
 *
 * The choice belongs to the phone in your hand, like its screen brightness, so
 * it is saved on the device and never sent to the server. That also means an
 * offline launch has the right colours from the first screen.
 */
export type AppearanceChoice = 'system' | 'light' | 'dark'

export const APPEARANCE_KEY = 'stourify_appearance'

/** Anything unrecognised — a value from a future build, a damaged write — is System. */
function parseChoice(raw: string | null): AppearanceChoice {
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

/**
 * Tells Android which night mode the app runs in, so the parts the app does not
 * paint itself — system alert dialogs, the status bar — follow the choice too.
 *
 * On Android, React Native's `setColorScheme` calls
 * `AppCompatDelegate.setDefaultNightMode`: 'light' and 'dark' pin the app, and
 * `null` is sent on as 'unspecified', which is "follow the system". Traced
 * through the installed 0.81 source on STOURIFY-290's spec rather than taken
 * on trust.
 *
 * `ThemeProvider` reads the choice directly as well, so the app's own colours
 * change the moment you tap and never wait on Android's round trip. If the
 * native module is missing (there is none under jest), the app's colours still
 * follow; only the native parts cannot, and throwing here would stall the
 * launch gate that waits on `loadFromStorage`.
 */
function applyToNative(choice: AppearanceChoice): void {
  try {
    Appearance.setColorScheme(choice === 'system' ? null : choice)
  } catch {
    // See above: the app's own colours do not depend on this call.
  }
}

interface AppearanceState {
  /** System until `loadFromStorage` resolves, which is what a fresh install keeps. */
  choice: AppearanceChoice
  /** Read by `RootNavigator`'s launch gate, so the first screen is drawn in the saved choice. */
  loadFromStorage: () => Promise<void>
  /** Applies at once, then saves. */
  choose: (choice: AppearanceChoice) => Promise<void>
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
  choice: 'system',

  loadFromStorage: async () => {
    let raw: string | null = null
    try {
      raw = await AsyncStorage.getItem(APPEARANCE_KEY)
    } catch {
      // The launch gate waits on this read. A read that threw would keep the
      // splash up for good, which is far worse than System colours for once.
    }

    const choice = parseChoice(raw)
    applyToNative(choice)
    set({ choice })
  },

  choose: async (choice) => {
    applyToNative(choice)
    set({ choice })
    await AsyncStorage.setItem(APPEARANCE_KEY, choice).catch(() => {})
  },
}))

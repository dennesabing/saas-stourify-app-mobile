import { fireEvent, render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import AboutScreen from '@/features/profile/screens/AboutScreen'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { palette } from '@/theme/tokens'

/**
 * About — artboard 8 of `docs/design/Stourify - Settings.dc.html` (STOURIFY-291).
 *
 * The version below is deliberately NOT the one in `app.json`. The screen has
 * to read the installed build's config through `expo-constants`; a screen that
 * imported `app.json` instead would render 0.x here and fail, which is the
 * whole point of the fake numbers. The fallback for a build with no config is
 * pinned in `__tests__/shared/installedBuild.test.ts`.
 */
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '9.8.7', android: { versionCode: 321 } } },
}))

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() } as any

function renderAbout(scheme: 'light' | 'dark' = 'light') {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider scheme={scheme}>
        <AboutScreen navigation={mockNavigation} route={{} as any} />
      </ThemeProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => jest.clearAllMocks())

describe('About (artboard 8)', () => {
  it('has the round back header, and Back leaves About', () => {
    const { getByText, getByLabelText } = renderAbout()

    expect(getByText('About')).toBeTruthy()
    fireEvent.press(getByLabelText('Back'))
    expect(mockNavigation.goBack).toHaveBeenCalled()
  })

  it('shows the wordmark and the version of the installed build', () => {
    const { getByText } = renderAbout()

    expect(getByText('Stourify')).toBeTruthy()
    expect(getByText('Version 9.8.7 (build 321)')).toBeTruthy()
  })

  it('carries the mission, where it was made, and a © line for this year', () => {
    const { getByText } = renderAbout()

    expect(getByText(/Helping curious travelers and locals discover/)).toBeTruthy()
    expect(getByText(/Made with care in General Santos City\./)).toBeTruthy()
    expect(
      getByText(new RegExp(`© ${new Date().getFullYear()} Stourify · All rights reserved\\.`)),
    ).toBeTruthy()
  })

  /**
   * Drawn on the canvas, backed by nothing: no public store listing to rate,
   * no social accounts on record, and no Unsplash photos in the app. A button
   * that opens nothing is a promise the app breaks (STOURIFY-75).
   */
  it('draws nothing the app cannot back', () => {
    const { queryByText } = renderAbout()

    expect(queryByText(/Rate Stourify/)).toBeNull()
    expect(queryByText(/Unsplash/)).toBeNull()
    expect(queryByText(/Inc\./)).toBeNull()
  })

  it('reads in the dark theme: the wordmark and version take the dark colours', () => {
    const { getByText } = renderAbout('dark')

    expect(StyleSheet.flatten(getByText('Stourify').props.style).color).toBe(palette.dark.ink)
    expect(StyleSheet.flatten(getByText('Version 9.8.7 (build 321)').props.style).color).toBe(
      palette.dark.muted,
    )
  })
})

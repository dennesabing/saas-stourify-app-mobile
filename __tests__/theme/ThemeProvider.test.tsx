import { act, render, screen } from '@testing-library/react-native'
import { Text as RNText } from 'react-native'
import { useAppearanceStore } from '@/theme/appearance'
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider'
import { palette } from '@/theme/tokens'

// What the phone is set to. `null` is what the test environment reports on its
// own, so it stays the default and the older cases below keep their meaning.
const mockPhoneScheme = { current: null as 'light' | 'dark' | null }

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockPhoneScheme.current,
}))

beforeEach(() => {
  mockPhoneScheme.current = null
  useAppearanceStore.setState({ choice: 'system' })
})

function ProbeSurface() {
  const theme = useTheme()
  return <RNText testID="surface">{theme.colors.surface}</RNText>
}

function ProbeScheme() {
  const theme = useTheme()
  return <RNText testID="scheme">{theme.scheme}</RNText>
}

describe('ThemeProvider', () => {
  it('serves the light palette by default', () => {
    render(
      <ThemeProvider scheme="light">
        <ProbeSurface />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('surface')).toHaveTextContent(palette.light.surface)
  })

  it('serves the dark palette when the scheme is dark', () => {
    render(
      <ThemeProvider scheme="dark">
        <ProbeSurface />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('surface')).toHaveTextContent(palette.dark.surface)
  })

  it('falls back to light when no scheme is forced and the OS reports none', () => {
    // useColorScheme() returns null in the test environment.
    render(
      <ThemeProvider>
        <ProbeScheme />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('scheme')).toHaveTextContent('light')
  })
})

/**
 * STOURIFY-290: Settings → Appearance. The operator runs the phone dark and
 * asked for a way to make Stourify light without changing the whole phone.
 */
describe('ThemeProvider and the Appearance choice', () => {
  it('on System, follows the phone', () => {
    mockPhoneScheme.current = 'dark'
    render(
      <ThemeProvider>
        <ProbeScheme />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('scheme')).toHaveTextContent('dark')
  })

  it('a Light choice wins over a dark phone', () => {
    mockPhoneScheme.current = 'dark'
    useAppearanceStore.setState({ choice: 'light' })
    render(
      <ThemeProvider>
        <ProbeScheme />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('scheme')).toHaveTextContent('light')
  })

  it('a Dark choice wins over a light phone', () => {
    mockPhoneScheme.current = 'light'
    useAppearanceStore.setState({ choice: 'dark' })
    render(
      <ThemeProvider>
        <ProbeScheme />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('scheme')).toHaveTextContent('dark')
  })

  it('repaints at once when the choice changes, with no remount', () => {
    mockPhoneScheme.current = 'dark'
    render(
      <ThemeProvider>
        <ProbeSurface />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('surface')).toHaveTextContent(palette.dark.surface)

    act(() => useAppearanceStore.setState({ choice: 'light' }))

    expect(screen.getByTestId('surface')).toHaveTextContent(palette.light.surface)
  })

  it('a forced scheme still wins over the choice, for the theme gallery and tests', () => {
    useAppearanceStore.setState({ choice: 'light' })
    render(
      <ThemeProvider scheme="dark">
        <ProbeScheme />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('scheme')).toHaveTextContent('dark')
  })
})

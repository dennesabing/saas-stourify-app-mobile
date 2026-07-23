import { render, screen } from '@testing-library/react-native'
import { Text as RNText } from 'react-native'
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider'
import { palette } from '@/theme/tokens'

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

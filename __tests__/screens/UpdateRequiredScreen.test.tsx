import { fireEvent, render, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import UpdateRequiredScreen from '@/shared/update/UpdateRequiredScreen'
import { ThemeProvider } from '@/theme/ThemeProvider'

/**
 * The one screen in the app whose whole job is to be the last thing anybody
 * sees. It replaces the entire interface, so the things worth pinning are the
 * things a person stuck behind it depends on: that it says what is wrong, that
 * the way out actually leads somewhere, and that there is no way past it.
 */
function renderScreen(props: Partial<React.ComponentProps<typeof UpdateRequiredScreen>> = {}) {
  return render(
    <ThemeProvider scheme="light">
      <UpdateRequiredScreen downloadUrl="https://cdn.example/2.0.0.apk" {...props} />
    </ThemeProvider>,
  )
}

describe('UpdateRequiredScreen', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('says the version is the problem, in words rather than an error code', () => {
    renderScreen()

    expect(screen.getByTestId('update-required')).toBeTruthy()
    expect(screen.getByText(/out of date/i)).toBeTruthy()
  })

  it('shows the message the release channel sent, when there is one', () => {
    renderScreen({ message: 'Stourify moved to a new address on 25 August.' })

    expect(screen.getByText('Stourify moved to a new address on 25 August.')).toBeTruthy()
  })

  it('falls back to its own wording when the channel sent no message', () => {
    // A blank space where the explanation should be is how an app looks broken
    // rather than out of date, which is the entire failure this screen exists
    // to end.
    renderScreen({ message: null })

    expect(screen.getByTestId('update-required-explanation')).toBeTruthy()
  })

  it('names the version to move to when it knows it', () => {
    renderScreen({ latestVersion: '2.0.0' })

    expect(screen.getByText(/2\.0\.0/)).toBeTruthy()
  })

  it('opens the download link when the button is pressed', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)

    renderScreen({ downloadUrl: 'https://cdn.example/2.0.0.apk' })
    fireEvent.press(screen.getByTestId('update-required-download'))

    expect(openURL).toHaveBeenCalledWith('https://cdn.example/2.0.0.apk')
  })

  it('survives a device with nothing that can open the link', () => {
    // `Linking.openURL` rejects on a device with no handler. An unhandled
    // rejection here would crash the one screen a stranded user has left.
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No handler'))

    renderScreen()

    expect(() => fireEvent.press(screen.getByTestId('update-required-download'))).not.toThrow()
  })

  it('hides the button entirely when there is nowhere to send anybody', () => {
    // Better a screen that explains and offers nothing than a button that
    // does nothing when pressed.
    renderScreen({ downloadUrl: null })

    expect(screen.queryByTestId('update-required-download')).toBeNull()
  })

  it('offers no way to dismiss it into a session that cannot work', () => {
    renderScreen()

    expect(screen.queryByTestId('update-required-dismiss')).toBeNull()
    expect(screen.queryByText(/later/i)).toBeNull()
    expect(screen.queryByText(/continue/i)).toBeNull()
  })

  it('prints the build identity, so whoever is looking can say which build this is', () => {
    renderScreen()

    expect(screen.getByTestId('build-identity')).toBeTruthy()
  })
})

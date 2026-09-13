import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { AxiosError } from 'axios'
import { Text as RNText } from 'react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import ChangePasswordScreen from '@/features/profile/screens/ChangePasswordScreen'
import { ThemeProvider } from '@/theme/ThemeProvider'

jest.mock('@/shared/api/account', () => ({ changePassword: jest.fn() }))

import { changePassword } from '@/shared/api/account'

/**
 * STOURIFY-302. The values below are fixtures, not anybody's password, and they
 * are deliberately distinctive: the no-echo test searches every rendered line
 * and every console call for them, and a common word would match by accident.
 * None of them is ever put in a test's name.
 */
const CURRENT = 'fixture-Current-7731'
const NEXT = 'fixture-Next-4412'
const OTHER = 'fixture-Other-9054'

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() } as any

function renderScreen(scheme: 'light' | 'dark' = 'light') {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider scheme={scheme}>
        <ChangePasswordScreen navigation={mockNavigation} route={{} as any} />
      </ThemeProvider>
    </SafeAreaProvider>,
  )
}

type Screen = ReturnType<typeof renderScreen>

function fill(screen: Screen, current: string, next: string, confirm: string) {
  fireEvent.changeText(screen.getByLabelText('Current password'), current)
  fireEvent.changeText(screen.getByLabelText('New password'), next)
  fireEvent.changeText(screen.getByLabelText('Confirm new password'), confirm)
}

function submit(screen: Screen) {
  fireEvent.press(screen.getByTestId('change-password-submit'))
}

/** An answer from the server, shaped the way axios hands one to a caller. */
function answered(status: number, data: unknown = {}) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: {} as any,
    data,
  })
}

/**
 * Every line of text the screen draws, joined — the text fields' own values are
 * NOT included, because those are `TextInput` props rather than `Text` children,
 * and a masked field holding what you typed is the one place a password belongs.
 */
function renderedText(screen: Screen): string {
  return screen
    .UNSAFE_getAllByType(RNText)
    .map((node) => {
      const { children } = node.props
      return Array.isArray(children) ? children.join('') : String(children ?? '')
    })
    .join('\n')
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(changePassword as jest.Mock).mockResolvedValue(undefined)
})

describe('the Change password screen', () => {
  it('has the round back header, and Back returns to Privacy & security', () => {
    const screen = renderScreen()

    expect(screen.getAllByText('Change password').length).toBeGreaterThan(0)
    fireEvent.press(screen.getByLabelText('Back'))
    expect(mockNavigation.goBack).toHaveBeenCalled()
  })

  it('says up front that every other device will be signed out', () => {
    const screen = renderScreen()

    expect(screen.getByText(/signs you out on every other phone and browser/)).toBeTruthy()
  })

  it('masks all three fields and gives the password manager the right hints', () => {
    const screen = renderScreen()

    const current = screen.getByLabelText('Current password')
    const next = screen.getByLabelText('New password')
    const confirm = screen.getByLabelText('Confirm new password')

    for (const field of [current, next, confirm]) {
      expect(field.props.secureTextEntry).toBe(true)
      expect(field.props.autoCorrect).toBe(false)
      expect(field.props.autoCapitalize).toBe('none')
    }
    expect(current.props.autoComplete).toBe('current-password')
    expect(current.props.textContentType).toBe('password')
    for (const field of [next, confirm]) {
      expect(field.props.autoComplete).toBe('new-password')
      expect(field.props.textContentType).toBe('newPassword')
    }
  })

  it('sends the three fields, then confirms and empties the form', async () => {
    const screen = renderScreen()

    fill(screen, CURRENT, NEXT, NEXT)
    submit(screen)

    await waitFor(() => expect(screen.getByTestId('password-changed')).toBeTruthy())
    expect(changePassword).toHaveBeenCalledWith({
      current_password: CURRENT,
      password: NEXT,
      password_confirmation: NEXT,
    })
    expect(screen.getByText(/Password changed/)).toBeTruthy()
    expect(screen.getByLabelText('Current password').props.value).toBe('')
    expect(screen.getByLabelText('New password').props.value).toBe('')
    expect(screen.getByLabelText('Confirm new password').props.value).toBe('')
  })

  it('names the field when the current password is wrong, and keeps what was typed', async () => {
    ;(changePassword as jest.Mock).mockRejectedValue(
      answered(422, {
        message: 'The password is incorrect.',
        errors: { current_password: ['The password is incorrect.'] },
      }),
    )
    const screen = renderScreen()

    fill(screen, OTHER, NEXT, NEXT)
    submit(screen)

    await waitFor(() => expect(screen.getByText("That isn't your current password.")).toBeTruthy())
    // The server's own wording is replaced here, not shown as well: with three
    // password fields on screen it does not say which one it means.
    expect(screen.queryByText('The password is incorrect.')).toBeNull()
    expect(screen.queryByTestId('password-changed')).toBeNull()
    expect(screen.getByLabelText('New password').props.value).toBe(NEXT)
  })

  it("shows the server's own message for a new password it refuses", async () => {
    ;(changePassword as jest.Mock).mockRejectedValue(
      answered(422, {
        message: 'The password field must be at least 12 characters.',
        errors: { password: ['The password field must be at least 12 characters.'] },
      }),
    )
    const screen = renderScreen()

    fill(screen, CURRENT, NEXT, NEXT)
    submit(screen)

    await waitFor(() =>
      expect(screen.getByText('The password field must be at least 12 characters.')).toBeTruthy(),
    )
  })

  it('catches a mismatched confirmation without spending one of the five tries', async () => {
    const screen = renderScreen()

    fill(screen, CURRENT, NEXT, OTHER)
    submit(screen)

    await waitFor(() => expect(screen.getByText("The two new passwords don't match.")).toBeTruthy())
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('catches an empty current password and a too-short new one before sending', async () => {
    const screen = renderScreen()

    fill(screen, '', 'short', 'short')
    submit(screen)

    await waitFor(() => expect(screen.getByText('Enter your current password.')).toBeTruthy())
    expect(screen.getByText('Your new password needs at least 8 characters.')).toBeTruthy()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('tells you to wait when the server says too many tries (429)', async () => {
    ;(changePassword as jest.Mock).mockRejectedValue(
      answered(429, { message: 'Too Many Attempts.' }),
    )
    const screen = renderScreen()

    fill(screen, CURRENT, NEXT, NEXT)
    submit(screen)

    await waitFor(() =>
      expect(screen.getByText('Too many tries. Wait a minute, then try again.')).toBeTruthy(),
    )
    expect(screen.queryByText('Too Many Attempts.')).toBeNull()
  })

  it('says to check the connection when nothing answered', async () => {
    ;(changePassword as jest.Mock).mockRejectedValue(
      new AxiosError('Network Error', AxiosError.ERR_NETWORK),
    )
    const screen = renderScreen()

    fill(screen, CURRENT, NEXT, NEXT)
    submit(screen)

    await waitFor(() =>
      expect(
        screen.getByText("We couldn't reach Stourify — check your connection and try again."),
      ).toBeTruthy(),
    )
  })

  it('never puts a typed password into a message or a log line, whatever went wrong', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => {}),
    )
    // A hostile server that echoes the request back in every place it could.
    // The screen must still show nothing typed: its sentences are its own, and
    // the one server message it passes on is a field rule, never a value.
    const echo = `${CURRENT} ${NEXT} ${OTHER}`
    // Each failure beside the sentence the screen says for it instead. Waiting
    // for that sentence proves the screen answered; the check afterwards proves
    // the answer carried nothing typed.
    const failures: [AxiosError, string][] = [
      [
        answered(422, { message: echo, errors: { current_password: [echo] } }),
        "That isn't your current password.",
      ],
      [
        answered(422, { message: echo, errors: { password: [echo] } }),
        "Stourify couldn't accept that new password.",
      ],
      [answered(429, { message: echo }), 'Too many tries. Wait a minute, then try again.'],
      [answered(500, { message: echo }), "Your password wasn't changed. Try again in a moment."],
      [
        new AxiosError(echo, AxiosError.ERR_NETWORK),
        "We couldn't reach Stourify — check your connection and try again.",
      ],
    ]

    try {
      for (const [failure, expected] of failures) {
        ;(changePassword as jest.Mock).mockRejectedValueOnce(failure)
        const screen = renderScreen()
        fill(screen, CURRENT, NEXT, NEXT)
        submit(screen)
        await waitFor(() => expect(screen.getByText(expected)).toBeTruthy())

        const shown = renderedText(screen)
        for (const secret of [CURRENT, NEXT, OTHER]) {
          expect(shown.includes(secret)).toBe(false)
        }
        screen.unmount()
        ;(changePassword as jest.Mock).mockClear()
      }

      // And the mismatch path, which never reaches the server at all.
      const screen = renderScreen()
      fill(screen, CURRENT, NEXT, OTHER)
      submit(screen)
      await waitFor(() =>
        expect(screen.getByText("The two new passwords don't match.")).toBeTruthy(),
      )
      const shown = renderedText(screen)
      for (const secret of [CURRENT, NEXT, OTHER]) {
        expect(shown.includes(secret)).toBe(false)
      }

      const logged = spies.flatMap((spy) =>
        spy.mock.calls.map((args) => args.map(String).join(' ')),
      )
      for (const secret of [CURRENT, NEXT, OTHER]) {
        expect(logged.some((line) => line.includes(secret))).toBe(false)
      }
    } finally {
      spies.forEach((spy) => spy.mockRestore())
    }
  })

  it('draws in the dark theme too', () => {
    const screen = renderScreen('dark')

    expect(screen.getByLabelText('Current password')).toBeTruthy()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import ForgotPasswordScreen from '@/features/auth/screens/ForgotPasswordScreen'
import * as authApi from '@/shared/api/auth'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/auth', () => ({
  forgotPassword: jest.fn(async () => ({ message: 'sent' })),
}))

const navigation = { navigate: jest.fn(), goBack: jest.fn(), popTo: jest.fn() } as any
const route = {} as any

beforeEach(() => jest.clearAllMocks())

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <ForgotPasswordScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

async function sendFor(email: string) {
  fireEvent.changeText(screen.getByPlaceholderText('you@email.com'), email)
  fireEvent.press(screen.getByText('Send reset link'))
  await waitFor(() => expect(screen.getByText('Check your inbox')).toBeTruthy())
}

it('requires an email before submitting', async () => {
  renderScreen()
  fireEvent.press(screen.getByText('Send reset link'))

  await waitFor(() => expect(screen.getByText('Email is required')).toBeTruthy())
  expect(authApi.forgotPassword).not.toHaveBeenCalled()
})

it('sends the reset request and confirms without leaking whether the account exists', async () => {
  renderScreen()
  await sendFor('a@b.com')

  expect(authApi.forgotPassword).toHaveBeenCalledWith('a@b.com')
  // The server answers 200 for any address, so the screen may name the address
  // it was given but must never say an account is there (STOURIFY-286).
  expect(screen.getByText(/If an account exists for/)).toBeTruthy()
  expect(screen.getByText('a@b.com')).toBeTruthy()
  expect(screen.queryByText(/We sent a reset link to/)).toBeNull()
})

it('offers the next step once the mail is sent', async () => {
  renderScreen()
  await sendFor('a@b.com')

  fireEvent.press(screen.getByText('I have a reset code'))
  expect(navigation.navigate).toHaveBeenCalledWith('ResetPassword', { email: 'a@b.com' })
})

// STOURIFY-286 — the Auth & Entry design.

it('explains itself before anything is sent', () => {
  renderScreen()

  expect(screen.getByText('Reset your password')).toBeTruthy()
  expect(screen.getByText(/we'll send you a secure link to set a new password/)).toBeTruthy()
})

it('resends to the same address', async () => {
  renderScreen()
  await sendFor('a@b.com')

  fireEvent.press(screen.getByText('Resend'))

  await waitFor(() => expect(screen.getByText('Sent again.')).toBeTruthy())
  expect(authApi.forgotPassword).toHaveBeenCalledTimes(2)
  expect(authApi.forgotPassword).toHaveBeenLastCalledWith('a@b.com')
})

it('goes back to the Log In already in the stack from either state, never a second one', async () => {
  // React Navigation 7's `navigate` stacks a new Log In on top of an existing
  // one; `popTo` returns to it. Seen on the emulator under STOURIFY-286.
  renderScreen()

  fireEvent.press(screen.getByText('Back to log in'))
  expect(navigation.popTo).toHaveBeenLastCalledWith('Login')

  await sendFor('a@b.com')
  fireEvent.press(screen.getByText('Back to log in'))
  expect(navigation.popTo).toHaveBeenLastCalledWith('Login')
  expect(navigation.navigate).not.toHaveBeenCalledWith('Login')
})

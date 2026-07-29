import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import ForgotPasswordScreen from '@/features/auth/screens/ForgotPasswordScreen'
import * as authApi from '@/shared/api/auth'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/auth', () => ({
  forgotPassword: jest.fn(async () => ({ message: 'sent' })),
}))

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

beforeEach(() => jest.clearAllMocks())

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <ForgotPasswordScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

it('requires an email before submitting', async () => {
  renderScreen()
  fireEvent.press(screen.getByText('Send reset link'))

  await waitFor(() => expect(screen.getByText('Email is required')).toBeTruthy())
  expect(authApi.forgotPassword).not.toHaveBeenCalled()
})

it('sends the reset request and confirms without leaking whether the account exists', async () => {
  renderScreen()
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
  fireEvent.press(screen.getByText('Send reset link'))

  await waitFor(() => {
    expect(authApi.forgotPassword).toHaveBeenCalledWith('a@b.com')
    expect(
      screen.getByText('If an account exists for that email, we have sent a reset link.'),
    ).toBeTruthy()
  })
})

it('offers the next step once the mail is sent', async () => {
  renderScreen()
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
  fireEvent.press(screen.getByText('Send reset link'))

  await waitFor(() => expect(screen.getByText('I have a reset code')).toBeTruthy())

  fireEvent.press(screen.getByText('I have a reset code'))
  expect(navigation.navigate).toHaveBeenCalledWith('ResetPassword', { email: 'a@b.com' })
})

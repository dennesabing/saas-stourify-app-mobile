import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import ResetPasswordScreen from '@/features/auth/screens/ResetPasswordScreen'
import * as authApi from '@/shared/api/auth'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/auth', () => ({
  resetPassword: jest.fn(async () => ({ message: 'ok' })),
}))

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

beforeEach(() => jest.clearAllMocks())

function renderScreen(email?: string) {
  return render(
    <TestProviders database={createTestDatabase()}>
      <ResetPasswordScreen navigation={navigation} route={{ params: { email } } as any} />
    </TestProviders>,
  )
}

it('prefills the email it was handed', () => {
  renderScreen('a@b.com')
  expect(screen.getByDisplayValue('a@b.com')).toBeTruthy()
})

it('submits the token, email and new password', async () => {
  renderScreen('a@b.com')

  fireEvent.changeText(screen.getByPlaceholderText('Paste the code from your email'), 'tok-123')
  fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'newpassword1')
  fireEvent.changeText(screen.getByPlaceholderText('Repeat your password'), 'newpassword1')
  fireEvent.press(screen.getByText('Reset password'))

  await waitFor(() => {
    expect(authApi.resetPassword).toHaveBeenCalledWith({
      token: 'tok-123',
      email: 'a@b.com',
      password: 'newpassword1',
      password_confirmation: 'newpassword1',
    })
  })
})

it('sends the user back to sign in once the password is reset', async () => {
  renderScreen('a@b.com')

  fireEvent.changeText(screen.getByPlaceholderText('Paste the code from your email'), 'tok-123')
  fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'newpassword1')
  fireEvent.changeText(screen.getByPlaceholderText('Repeat your password'), 'newpassword1')
  fireEvent.press(screen.getByText('Reset password'))

  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('Login'))
})

it('refuses mismatched passwords without calling the server', async () => {
  renderScreen('a@b.com')

  fireEvent.changeText(screen.getByPlaceholderText('Paste the code from your email'), 'tok-123')
  fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'newpassword1')
  fireEvent.changeText(screen.getByPlaceholderText('Repeat your password'), 'different')
  fireEvent.press(screen.getByText('Reset password'))

  await waitFor(() => expect(screen.getByText('Passwords do not match')).toBeTruthy())
  expect(authApi.resetPassword).not.toHaveBeenCalled()
})

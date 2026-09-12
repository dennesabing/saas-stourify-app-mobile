import { render, fireEvent, waitFor, screen } from '@testing-library/react-native'
import LoginScreen from '@/features/auth/screens/LoginScreen'

jest.mock('@/shared/api/auth', () => ({
  login: jest.fn(),
}))

jest.mock('@/shared/store/auth', () => ({
  useAuthStore: () => ({
    setToken: jest.fn(),
    setUser: jest.fn(),
  }),
}))

jest.mock('@/sync/session', () => ({ onLogin: jest.fn(async () => undefined) }))

import * as authApi from '@/shared/api/auth'
import { onLogin } from '@/sync/session'
const mockLogin = authApi.login as jest.Mock

// Create a minimal navigation mock
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any

beforeEach(() => {
  jest.clearAllMocks()
})

function renderLogin() {
  return render(<LoginScreen navigation={mockNavigation} route={{} as any} />)
}

test('shows validation error when email is empty', async () => {
  renderLogin()
  fireEvent.press(screen.getByText('Log in'))
  await waitFor(() => {
    expect(screen.getByText('Email is required')).toBeTruthy()
  })
})

test('shows validation error when password is empty', async () => {
  renderLogin()
  fireEvent.changeText(screen.getByPlaceholderText('you@email.com'), 'test@test.com')
  fireEvent.press(screen.getByText('Log in'))
  await waitFor(() => {
    expect(screen.getByText('Password is required')).toBeTruthy()
  })
})

test('calls login API with email and password on valid submit', async () => {
  mockLogin.mockResolvedValueOnce({
    token: 'tok123',
    user: { id: '1', name: 'Ana', email: 'ana@test.com', uuid: 'u1' },
  })
  renderLogin()
  fireEvent.changeText(screen.getByPlaceholderText('you@email.com'), 'ana@test.com')
  fireEvent.changeText(screen.getByPlaceholderText('Enter your password'), 'secret123')
  fireEvent.press(screen.getByText('Log in'))
  await waitFor(() => {
    expect(mockLogin).toHaveBeenCalledWith('ana@test.com', 'secret123')
  })
})

it('offers the forgot-password route', () => {
  renderLogin()

  fireEvent.press(screen.getByText('Forgot password?'))
  expect(mockNavigation.navigate).toHaveBeenCalledWith('ForgotPassword')
})

it('primes the sync session after signing in', async () => {
  mockLogin.mockResolvedValueOnce({
    token: 'tok123',
    user: { id: '1', name: 'Ana', email: 'a@b.com', uuid: 'u1' },
  })
  renderLogin()
  fireEvent.changeText(screen.getByPlaceholderText('you@email.com'), 'a@b.com')
  fireEvent.changeText(screen.getByPlaceholderText('Enter your password'), 'password123')
  fireEvent.press(screen.getByText('Log in'))

  await waitFor(() => expect(onLogin).toHaveBeenCalled())
})

// STOURIFY-286 — the Auth & Entry design.

it('greets a returning explorer the way the design does', () => {
  renderLogin()

  expect(screen.getByText('Welcome back')).toBeTruthy()
  expect(screen.getByText('Log in to keep exploring.')).toBeTruthy()
})

it('sends a newcomer to sign up from the line at the bottom', () => {
  renderLogin()

  fireEvent.press(screen.getByText('Sign up'))
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Register')
})

it('goes back from the round back button', () => {
  renderLogin()

  fireEvent.press(screen.getByLabelText('Back'))
  expect(mockNavigation.goBack).toHaveBeenCalled()
})

it('draws no social sign-in — the server has none to call', () => {
  renderLogin()

  expect(screen.queryByText(/Google|Apple|Facebook/)).toBeNull()
})

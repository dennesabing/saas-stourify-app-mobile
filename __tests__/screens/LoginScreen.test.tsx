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
const mockNavigation = { navigate: jest.fn() } as any

beforeEach(() => {
  jest.clearAllMocks()
})

function renderLogin() {
  return render(<LoginScreen navigation={mockNavigation} route={{} as any} />)
}

test('shows validation error when email is empty', async () => {
  renderLogin()
  fireEvent.press(screen.getByText('Sign in'))
  await waitFor(() => {
    expect(screen.getByText('Email is required')).toBeTruthy()
  })
})

test('shows validation error when password is empty', async () => {
  renderLogin()
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'test@test.com')
  fireEvent.press(screen.getByText('Sign in'))
  await waitFor(() => {
    expect(screen.getByText('Password is required')).toBeTruthy()
  })
})

test('calls login API with email and password on valid submit', async () => {
  mockLogin.mockResolvedValueOnce({ token: 'tok123', user: { id: '1', name: 'Ana', email: 'ana@test.com', uuid: 'u1' } })
  renderLogin()
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'ana@test.com')
  fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'secret123')
  fireEvent.press(screen.getByText('Sign in'))
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
  mockLogin.mockResolvedValueOnce({ token: 'tok123', user: { id: '1', name: 'Ana', email: 'a@b.com', uuid: 'u1' } })
  renderLogin()
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
  fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'password123')
  fireEvent.press(screen.getByText('Sign in'))

  await waitFor(() => expect(onLogin).toHaveBeenCalled())
})

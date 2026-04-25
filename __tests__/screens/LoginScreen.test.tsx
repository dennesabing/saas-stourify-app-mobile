import { render, fireEvent, waitFor } from '@testing-library/react-native'
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

import * as authApi from '@/shared/api/auth'
const mockLogin = authApi.login as jest.Mock

// Create a minimal navigation mock
const mockNavigation = { navigate: jest.fn() } as any

beforeEach(() => {
  jest.clearAllMocks()
})

test('shows validation error when email is empty', async () => {
  const { getByText } = render(<LoginScreen navigation={mockNavigation} route={{} as any} />)
  fireEvent.press(getByText('Login'))
  await waitFor(() => {
    expect(getByText('Email is required')).toBeTruthy()
  })
})

test('shows validation error when password is empty', async () => {
  const { getByText, getByPlaceholderText } = render(
    <LoginScreen navigation={mockNavigation} route={{} as any} />
  )
  fireEvent.changeText(getByPlaceholderText('Email address'), 'test@test.com')
  fireEvent.press(getByText('Login'))
  await waitFor(() => {
    expect(getByText('Password is required')).toBeTruthy()
  })
})

test('calls login API with email and password on valid submit', async () => {
  mockLogin.mockResolvedValueOnce({ token: 'tok123', user: { id: '1', name: 'Ana', email: 'ana@test.com', uuid: 'u1' } })
  const { getByText, getByPlaceholderText } = render(
    <LoginScreen navigation={mockNavigation} route={{} as any} />
  )
  fireEvent.changeText(getByPlaceholderText('Email address'), 'ana@test.com')
  fireEvent.changeText(getByPlaceholderText('Password'), 'secret123')
  fireEvent.press(getByText('Login'))
  await waitFor(() => {
    expect(mockLogin).toHaveBeenCalledWith('ana@test.com', 'secret123')
  })
})

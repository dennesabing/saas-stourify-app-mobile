import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import RegisterScreen from '@/features/auth/screens/RegisterScreen'
import * as authApi from '@/shared/api/auth'
import { onLogin } from '@/sync/session'
import { useOnboardingStore } from '@/shared/store/onboarding'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/auth', () => ({
  register: jest.fn(async () => ({ token: 'tok', user: { id: 1, name: 'A', email: 'a@b.com' } })),
  getAuthConfig: jest.fn(async () => ({ invitation_only: false, registration_enabled: true })),
}))

jest.mock('@/sync/session', () => ({ onLogin: jest.fn(async () => undefined) }))

jest.mock('@/shared/store/auth', () => ({
  useAuthStore: () => ({
    setToken: jest.fn(),
    setUser: jest.fn(),
  }),
}))

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <RegisterScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  useOnboardingStore.setState({ shouldOnboard: false, completed: null })
})

async function fillValidForm() {
  fireEvent.changeText(screen.getByPlaceholderText('Your name'), 'Ada')
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
  fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'password123')
  fireEvent.changeText(screen.getByPlaceholderText('Repeat your password'), 'password123')
}

it('primes the sync session after registering — the regression this test exists for', async () => {
  renderScreen()
  await fillValidForm()
  fireEvent.press(screen.getByText('Create account'))

  await waitFor(() => {
    expect(authApi.register).toHaveBeenCalledWith('Ada', 'a@b.com', 'password123', 'password123', undefined)
    expect(onLogin).toHaveBeenCalled()
  })
})

it('routes into onboarding after a successful registration — never after an ordinary login', async () => {
  renderScreen()
  await fillValidForm()
  fireEvent.press(screen.getByText('Create account'))

  await waitFor(() => {
    expect(useOnboardingStore.getState().shouldOnboard).toBe(true)
  })
})

it('does not submit when the passwords differ', async () => {
  renderScreen()
  fireEvent.changeText(screen.getByPlaceholderText('Your name'), 'Ada')
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b.com')
  fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'password123')
  fireEvent.changeText(screen.getByPlaceholderText('Repeat your password'), 'different')
  fireEvent.press(screen.getByText('Create account'))

  await waitFor(() => {
    expect(screen.getByText('Passwords do not match')).toBeTruthy()
  })
  expect(authApi.register).not.toHaveBeenCalled()
})

it('hides the invitation code field when registration is open', async () => {
  renderScreen()

  await waitFor(() => expect(authApi.getAuthConfig).toHaveBeenCalled())
  expect(screen.queryByPlaceholderText('Invitation code')).toBeNull()
})

it('asks for an invitation code when the server requires one', async () => {
  ;(authApi.getAuthConfig as jest.Mock).mockResolvedValueOnce({
    invitation_only: true,
    registration_enabled: true,
  })

  renderScreen()

  await waitFor(() => {
    expect(screen.getByPlaceholderText('Invitation code')).toBeTruthy()
  })
})

it('says so when registration is closed, instead of failing on submit', async () => {
  ;(authApi.getAuthConfig as jest.Mock).mockResolvedValueOnce({
    invitation_only: false,
    registration_enabled: false,
  })

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Registration is currently closed.')).toBeTruthy()
  })
})

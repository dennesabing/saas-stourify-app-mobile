import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LoginScreen from '@/features/auth/screens/LoginScreen'
import WelcomeScreen from '@/features/auth/screens/WelcomeScreen'
import SettingsScreen from '@/features/profile/screens/SettingsScreen'
import { BUILD_IDENTITY } from '@/shared/config/buildIdentity'
import { trackQueryClient } from '../support/queryClients'

jest.mock('@/shared/api/auth', () => ({ login: jest.fn(), logout: jest.fn() }))
jest.mock('@/shared/store/auth', () => ({
  useAuthStore: () => ({ setToken: jest.fn(), setUser: jest.fn() }),
}))
jest.mock('@/sync/session', () => ({ onLogin: jest.fn(), signOut: jest.fn() }))
jest.mock('@/shared/api/profiles', () => ({
  getMyProfile: jest.fn().mockResolvedValue({ uuid: 'p1', username: 'ziv', is_private: false }),
  updateMyProfile: jest.fn(),
}))
jest.mock('@/shared/api/account', () => ({
  deleteAccount: jest.fn(),
  deletionOutcomeIsUnknown: jest.fn(() => false),
}))

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

/**
 * Whoever is about to trust a mobile live run has to read the app's own
 * version off the screen first — and on a fresh device the only screens they
 * can reach are the signed-out ones. So Welcome and Login carry it, and
 * Settings carries it too for a phone that is already signed in.
 */
describe('build identity footer', () => {
  it('shows on Welcome — the first screen a fresh install opens', () => {
    const { getByTestId } = render(<WelcomeScreen navigation={navigation} route={route} />)
    expect(getByTestId('build-identity').props.children).toBe(BUILD_IDENTITY)
  })

  it('shows on Login — the spot the testing rule names', () => {
    const { getByTestId } = render(<LoginScreen navigation={navigation} route={route} />)
    expect(getByTestId('build-identity').props.children).toBe(BUILD_IDENTITY)
  })

  it('shows on Settings, so the check also works on a signed-in device', () => {
    const qc = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
    const { getByTestId } = render(
      <QueryClientProvider client={qc}>
        <SettingsScreen navigation={navigation} route={route} />
      </QueryClientProvider>,
    )
    expect(getByTestId('build-identity').props.children).toBe(BUILD_IDENTITY)
  })
})

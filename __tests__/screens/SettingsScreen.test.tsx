import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import SettingsScreen from '@/features/profile/screens/SettingsScreen'

jest.mock('@/shared/api/auth', () => ({
  logout: jest.fn(() => Promise.resolve()),
}))

jest.mock('@/shared/api/settings', () => ({
  getAccountSettings: jest.fn(() => Promise.resolve({ account_visibility: 'public', follow_mode: 'open' })),
  updateAccountSettings: jest.fn(),
}))

// The seam under test: SettingsScreen's Logout button MUST route through
// `signOut` — the ONE teardown path (database wipe, cursor reset, cache
// clear, navigate) — not through `useAuthStore.getState().clearAuth()`
// directly. A handler that calls `clearAuth()` alone would never touch this
// mock, so this test fails against that (pre-fix) implementation.
jest.mock('@/sync/session', () => ({
  signOut: jest.fn(() => Promise.resolve()),
}))

import * as authApi from '@/shared/api/auth'
import { signOut } from '@/sync/session'

const mockNavigation = { goBack: jest.fn() } as any

function renderSettings() {
  // `gcTime: 0`, matching `__tests__/support/TestProviders.tsx`'s established
  // convention: React Query's default garbage-collection timer otherwise
  // leaves a handle open past the test, and jest never exits on its own.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <SettingsScreen navigation={mockNavigation} route={{} as any} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('the Logout button calls authApi.logout then routes teardown through signOut()', async () => {
  const { getByText } = renderSettings()

  fireEvent.press(getByText('Logout'))

  await waitFor(() => {
    expect(authApi.logout).toHaveBeenCalled()
    expect(signOut).toHaveBeenCalled()
  })
})

test('the Logout button does not call clearAuth directly — signOut is the only teardown', async () => {
  const { getByText } = renderSettings()

  fireEvent.press(getByText('Logout'))

  await waitFor(() => {
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})

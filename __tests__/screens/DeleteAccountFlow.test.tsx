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

jest.mock('@/shared/api/account', () => ({
  deleteAccount: jest.fn(() => Promise.resolve()),
  // Not mocked away: the timeout-versus-rejection distinction is the thing two
  // of the tests below are about, so the real predicate has to run.
  deletionOutcomeIsUnknown: jest.requireActual('@/shared/api/account').deletionOutcomeIsUnknown,
}))

// Same seam the Logout test guards, and it matters more here: after the server
// has deleted the account, a teardown that skipped `signOut` would leave the
// deleted user's spots, posts and sync cursor sitting in the local database on
// the device, still rendering, with no server left to correct them.
jest.mock('@/sync/session', () => ({
  signOut: jest.fn(() => Promise.resolve()),
}))

import * as accountApi from '@/shared/api/account'
import { signOut } from '@/sync/session'

const mockNavigation = { goBack: jest.fn() } as any

function renderSettings() {
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

test('Delete account is reachable from Settings', () => {
  // Play requires the deletion path to exist IN the app. A web-only deletion
  // form does not satisfy it, so the affordance being present is itself the
  // requirement, not a detail of it.
  const { getByText } = renderSettings()

  expect(getByText('Delete account')).toBeTruthy()
})

test('tapping Delete account does not delete anything on its own', async () => {
  const { getByText } = renderSettings()

  fireEvent.press(getByText('Delete account'))

  // It opens a confirmation. The destructive call must never be one tap away
  // from a settings list somebody is scrolling.
  expect(getByText('Delete my account')).toBeTruthy()
  expect(accountApi.deleteAccount).not.toHaveBeenCalled()
})

test('confirming without credentials still does not call the API', async () => {
  const { getByText } = renderSettings()

  fireEvent.press(getByText('Delete account'))
  fireEvent.press(getByText('Delete my account'))

  await waitFor(() => {
    expect(accountApi.deleteAccount).not.toHaveBeenCalled()
  })
})

test('confirming with email and password deletes, then tears the session down', async () => {
  const { getByText, getByPlaceholderText } = renderSettings()

  fireEvent.press(getByText('Delete account'))
  fireEvent.changeText(getByPlaceholderText('Your email address'), 'me@example.com')
  fireEvent.changeText(getByPlaceholderText('Your password'), 'secret-pass')
  fireEvent.press(getByText('Delete my account'))

  await waitFor(() => {
    expect(accountApi.deleteAccount).toHaveBeenCalledWith('me@example.com', 'secret-pass')
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})

test('a rejected deletion surfaces the error and leaves the session intact', async () => {
  ;(accountApi.deleteAccount as jest.Mock).mockRejectedValueOnce({
    response: { data: { message: 'The password is incorrect.' } },
  })

  const { getByText, getByPlaceholderText } = renderSettings()

  fireEvent.press(getByText('Delete account'))
  fireEvent.changeText(getByPlaceholderText('Your email address'), 'me@example.com')
  fireEvent.changeText(getByPlaceholderText('Your password'), 'wrong')
  fireEvent.press(getByText('Delete my account'))

  await waitFor(() => {
    expect(getByText('The password is incorrect.')).toBeTruthy()
  })

  // The half-deleted state is the one to guard against: signing out on a
  // failed request would log the user out of an account that still exists and
  // read to them as a deletion that worked.
  expect(signOut).not.toHaveBeenCalled()
})

test('a timed-out deletion signs out rather than claiming failure', async () => {
  // Found live, not reasoned about: the dev backend took 19s to complete the
  // deletion, the client gave up at 15s, and the app showed "could not delete
  // your account" over an account that was already gone — leaving the user
  // holding a revoked token, so every retry answered 401. A response-less
  // error means the outcome is UNKNOWN, and the safe reading of unknown is
  // that it worked.
  ;(accountApi.deleteAccount as jest.Mock).mockRejectedValueOnce(
    Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' })
  )

  const { getByText, getByPlaceholderText, queryByText } = renderSettings()

  fireEvent.press(getByText('Delete account'))
  fireEvent.changeText(getByPlaceholderText('Your email address'), 'me@example.com')
  fireEvent.changeText(getByPlaceholderText('Your password'), 'secret-pass')
  fireEvent.press(getByText('Delete my account'))

  await waitFor(() => {
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  expect(queryByText('Could not delete your account. Please try again.')).toBeNull()
})

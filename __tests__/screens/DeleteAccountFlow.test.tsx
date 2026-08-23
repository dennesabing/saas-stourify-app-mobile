import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import SettingsScreen from '@/features/profile/screens/SettingsScreen'

jest.mock('@/shared/api/auth', () => ({
  logout: jest.fn(() => Promise.resolve()),
}))

jest.mock('@/shared/api/profiles', () => ({
  getMyProfile: jest.fn(() => Promise.resolve({ uuid: 'p1', username: 'ziv', is_private: false })),
  updateMyProfile: jest.fn(),
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
import { trackQueryClient } from '../support/queryClients'

const mockNavigation = { goBack: jest.fn() } as any

function renderSettings() {
  const qc = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )
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
    Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' }),
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

// ---------------------------------------------------------------------------
// The reveal toggle (STOURIFY-164).
//
// STOURIFY-99 put a Show / Hide button on password fields by putting it inside
// the shared `Input` component, so every field built from that got it for free.
// This one was built from React Native's own TextInput, so the change went
// straight past it -- and it is the field where seeing what you typed matters
// most, because getting it wrong comes back as a validation error that reads
// like a wrong password, on an action that cannot be undone.
//
// These cases assert the BEHAVIOUR here rather than trusting that the component
// swap happened. `Input`'s own suite already proves the toggle works; what it
// cannot prove is that this screen uses it, and that is the entire bug.
// ---------------------------------------------------------------------------

test('the delete-account password field offers a reveal button', () => {
  const { getByText, getByLabelText } = renderSettings()

  fireEvent.press(getByText('Delete account'))

  expect(getByLabelText('Show password')).toBeTruthy()
})

test('the delete-account password starts masked and reveals on Show', () => {
  const { getByText, getByPlaceholderText, getByLabelText } = renderSettings()

  fireEvent.press(getByText('Delete account'))
  const field = getByPlaceholderText('Your password')
  fireEvent.changeText(field, 'hunter2')

  // Starts hidden, every time. Nothing can pass it in revealed.
  expect(field.props.secureTextEntry).toBe(true)

  fireEvent.press(getByLabelText('Show password'))
  expect(getByPlaceholderText('Your password').props.secureTextEntry).toBe(false)
  expect(getByText('Hide')).toBeTruthy()

  fireEvent.press(getByLabelText('Hide password'))
  expect(getByPlaceholderText('Your password').props.secureTextEntry).toBe(true)
})

test('the reveal survives carrying on typing', () => {
  // The property a naive implementation breaks: this screen re-renders on every
  // keystroke, so a reveal reset on change would flick back to dots during the
  // exact activity it exists for.
  const { getByText, getByPlaceholderText, getByLabelText } = renderSettings()

  fireEvent.press(getByText('Delete account'))
  fireEvent.changeText(getByPlaceholderText('Your password'), 'hunt')
  fireEvent.press(getByLabelText('Show password'))
  fireEvent.changeText(getByPlaceholderText('Your password'), 'hunter2')

  expect(getByPlaceholderText('Your password').props.secureTextEntry).toBe(false)
})

test('the email field is not given a password toggle', () => {
  // The reveal belongs to the password field alone. A component swap that put
  // one on both would be a different bug wearing this fix's clothes.
  const { getByText, getAllByLabelText } = renderSettings()

  fireEvent.press(getByText('Delete account'))

  expect(getAllByLabelText('Show password')).toHaveLength(1)
})

test('both confirmation fields carry a name a screen reader can announce', () => {
  // They never did. The only text on either node was the placeholder, and a
  // placeholder disappears the moment the field has content -- so once you had
  // typed, there was nothing left to identify the field by.
  const { getByText, getByLabelText } = renderSettings()

  fireEvent.press(getByText('Delete account'))

  expect(getByLabelText('Email')).toBeTruthy()
  expect(getByLabelText('Password')).toBeTruthy()
})

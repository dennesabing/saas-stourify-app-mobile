import { QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import EditProfileScreen from '@/features/profile/screens/EditProfileScreen'
import type { ExplorerProfile } from '@/shared/api/profiles'
import { createTestDatabase, seedCity } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

/**
 * The edit half of the explorer identity surface (STOURIFY-38).
 *
 * The seam these tests hold is **which endpoint the Save button hits, and with
 * what**. Until this card the screen posted `PUT /user/profile` — an address no
 * route file in the project declares — so every save was a 404, and the two
 * fields it collected were the platform account's `name` plus the profile's
 * `bio` mashed into one body. Asserting on `updateMyProfile` is therefore not
 * mock-shaped busywork: an implementation that posts to the old address, or
 * that sends `name`, fails here and passes nothing.
 */

jest.mock('@/shared/api/profiles', () => ({
  getMyProfile: jest.fn(),
  updateMyProfile: jest.fn(),
}))

import { getMyProfile, updateMyProfile } from '@/shared/api/profiles'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function profileFixture(over: Partial<ExplorerProfile> = {}): ExplorerProfile {
  return {
    uuid: 'profile-1',
    user_uuid: 'user-me',
    name: 'Ramil Santos',
    username: 'santos_ramil',
    bio: 'Chasing coastlines.',
    website: null,
    interests: ['Food'],
    home_city: null,
    is_private: false,
    shows_location_on_spots: true,
    counts: { spots: 0, followers: 0, following: 0 },
    viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null },
    created_at: null,
    can: {},
    ...over,
  }
}

async function renderScreen() {
  const database = createTestDatabase()
  await seedCity(database, { uuid: 'city-gensan', serverId: 5, name: 'General Santos' })

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

  const view = render(
    <TestProviders database={database} queryClient={queryClient}>
      <EditProfileScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )

  return { database, view, queryClient, invalidateSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getMyProfile as jest.Mock).mockResolvedValue(profileFixture())
  ;(updateMyProfile as jest.Mock).mockResolvedValue(profileFixture())
})

// ---------------------------------------------------------------------------
// The address it saves to
// ---------------------------------------------------------------------------

test('saving calls updateMyProfile — the explorer profile endpoint, not the account one', async () => {
  await renderScreen()

  fireEvent.changeText(await screen.findByTestId('edit-profile-bio'), 'Now chasing mountains.')
  fireEvent.press(screen.getByText('Save changes'))

  await waitFor(() => expect(updateMyProfile).toHaveBeenCalled())
})

test('the body carries only fields the endpoint accepts, and never the account name', async () => {
  await renderScreen()

  fireEvent.changeText(await screen.findByTestId('edit-profile-username'), 'santos.ramil')
  fireEvent.changeText(screen.getByTestId('edit-profile-bio'), 'Now chasing mountains.')
  fireEvent.changeText(screen.getByTestId('edit-profile-website'), 'https://ramil.example')
  fireEvent.press(screen.getByText('General Santos'))
  fireEvent.press(screen.getByText('Nature'))
  fireEvent.press(screen.getByText('Save changes'))

  await waitFor(() => expect(updateMyProfile).toHaveBeenCalled())

  const payload = (updateMyProfile as jest.Mock).mock.calls[0][0]

  expect(payload).toEqual({
    username: 'santos.ramil',
    bio: 'Now chasing mountains.',
    website: 'https://ramil.example',
    home_city_uuid: 'city-gensan',
    interests: ['Food', 'Nature'],
  })
  // `name` belongs to the platform account (`PUT /me`), not to this endpoint.
  // Sending it would be silently dropped, which is the older half of this bug.
  expect(payload).not.toHaveProperty('name')
})

test('an untouched field is left out, so editing a bio does not restate the username', async () => {
  await renderScreen()

  fireEvent.changeText(await screen.findByTestId('edit-profile-bio'), 'Now chasing mountains.')
  fireEvent.press(screen.getByText('Save changes'))

  await waitFor(() => expect(updateMyProfile).toHaveBeenCalled())
  expect((updateMyProfile as jest.Mock).mock.calls[0][0]).toEqual({ bio: 'Now chasing mountains.' })
})

test('a successful save drops the cache entry the profile header actually reads', async () => {
  // Found on the emulator, not here (STOURIFY-38). The first version of this
  // screen cached under `['profile','me']` and invalidated that — a key nothing
  // else in the app uses. The save reached the server, the screen went back,
  // and the header underneath still showed the old bio. The header reads
  // `['explorer-profile','me']` (`ProfileScreen.tsx:83`), so that is the name
  // both sides have to agree on, and this test is what holds them together.
  const { invalidateSpy } = await renderScreen()

  fireEvent.changeText(await screen.findByTestId('edit-profile-bio'), 'Now chasing mountains.')
  fireEvent.press(screen.getByText('Save changes'))

  await waitFor(() =>
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['explorer-profile', 'me'] }),
  )
})

test('a successful save goes back', async () => {
  await renderScreen()

  fireEvent.changeText(await screen.findByTestId('edit-profile-bio'), 'Now chasing mountains.')
  fireEvent.press(screen.getByText('Save changes'))

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled())
})

test('the form fills from the settled read, never from the copy left in the cache', async () => {
  // Found on the emulator (STOURIFY-38). This app keeps React Query's cache on
  // disk between launches, so opening this screen almost always has an answer
  // available instantly — last launch's. The first version seeded from that,
  // which showed the pre-edit bio after a save and would have written it
  // straight back on the next save, quietly undoing the user's own change.
  const database = createTestDatabase()
  await seedCity(database, { uuid: 'city-gensan', serverId: 5, name: 'General Santos' })

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  queryClient.setQueryData(['explorer-profile', 'me'], profileFixture({ bio: 'The stale one.' }))
  ;(getMyProfile as jest.Mock).mockResolvedValue(profileFixture({ bio: 'The fresh one.' }))

  render(
    <TestProviders database={database} queryClient={queryClient}>
      <EditProfileScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )

  const bio = await screen.findByTestId('edit-profile-bio')
  expect(bio.props.value).toBe('The fresh one.')
})

// ---------------------------------------------------------------------------
// What the server says when it refuses
// ---------------------------------------------------------------------------

test("a 422 on username renders the server's own message and keeps the form open", async () => {
  ;(updateMyProfile as jest.Mock).mockRejectedValue({
    isAxiosError: true,
    response: { status: 422, data: { message: 'The given data was invalid.', errors: { username: ['That username is taken.'] } } },
  })

  await renderScreen()

  fireEvent.changeText(await screen.findByTestId('edit-profile-username'), 'taken_name')
  fireEvent.press(screen.getByText('Save changes'))

  expect(await screen.findByText('That username is taken.')).toBeTruthy()
  expect(navigation.goBack).not.toHaveBeenCalled()
  // What the user typed survives the refusal — they have to be able to fix it.
  expect(screen.getByTestId('edit-profile-username').props.value).toBe('taken_name')
})

test('typing a new username clears the message about the old one', async () => {
  // Also seen on the emulator: "That username is taken." stayed under the box
  // while the user typed a different name, so the app looked like it had not
  // noticed the fix. The message is about a value no longer in the field.
  ;(updateMyProfile as jest.Mock).mockRejectedValue({
    isAxiosError: true,
    response: { status: 422, data: { errors: { username: ['That username is taken.'] } } },
  })

  await renderScreen()

  fireEvent.changeText(await screen.findByTestId('edit-profile-username'), 'taken_name')
  fireEvent.press(screen.getByText('Save changes'))
  expect(await screen.findByText('That username is taken.')).toBeTruthy()

  fireEvent.changeText(screen.getByTestId('edit-profile-username'), 'a_free_name')

  await waitFor(() => expect(screen.queryByText('That username is taken.')).toBeNull())
})

// ---------------------------------------------------------------------------
// The "Set up profile" recovery path
// ---------------------------------------------------------------------------

test('no profile yet renders an empty form, not an error', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(null)

  await renderScreen()

  const username = await screen.findByTestId('edit-profile-username')
  expect(username.props.value).toBe('')
  expect(screen.getByTestId('edit-profile-bio').props.value).toBe('')
})

test('the first save from an empty form still goes to the same upsert endpoint', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(null)

  await renderScreen()

  fireEvent.changeText(await screen.findByTestId('edit-profile-username'), 'brand_new')
  fireEvent.press(screen.getByText('Save changes'))

  await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ username: 'brand_new' }))
})

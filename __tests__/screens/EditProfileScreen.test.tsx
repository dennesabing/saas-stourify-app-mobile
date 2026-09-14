import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
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
 *
 * Since STOURIFY-307 the screen also writes the two things that belong to the
 * platform account rather than the profile — your photo (`POST|DELETE
 * /me/avatar`) and your display name (`PUT /me`) — so the same seam now has
 * three endpoints on it, and the tests below say which one each change goes to.
 */

jest.mock('@/shared/api/profiles', () => ({
  getMyProfile: jest.fn(),
  updateMyProfile: jest.fn(),
}))

jest.mock('@/shared/api/account', () => ({
  updateDisplayName: jest.fn(),
  uploadAvatar: jest.fn(),
  removeAvatar: jest.fn(),
}))

jest.mock('@/features/profile/api/pickAvatar', () => ({
  pickAvatar: jest.fn(),
}))

/**
 * The connectivity seam `useIsOnline` reads, replaced by a switch the tests
 * flip — so the hook itself is exercised rather than replaced.
 */
let mockOnline = true

jest.mock('@/sync/seams/connectivity', () => ({
  netInfoConnectivity: {
    isOnline: () => mockOnline,
    subscribe: () => () => {},
  },
}))

import { getMyProfile, updateMyProfile } from '@/shared/api/profiles'
import { removeAvatar, updateDisplayName, uploadAvatar } from '@/shared/api/account'
import { pickAvatar } from '@/features/profile/api/pickAvatar'
import { useAuthStore } from '@/shared/store/auth'
import { trackQueryClient } from '../support/queryClients'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

const OLD_PHOTO = 'https://cdn.example/old-medium.jpg'
const NEW_PHOTO = 'https://cdn.example/new-medium.jpg'
const PICKED = { uri: 'file:///cache/avatar-1.jpg', name: 'avatar-1.jpg', type: 'image/jpeg' }

function profileFixture(over: Partial<ExplorerProfile> = {}): ExplorerProfile {
  return {
    uuid: 'profile-1',
    user_uuid: 'user-me',
    name: 'Ramil Santos',
    avatar_url: null,
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

  const queryClient = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

  const view = render(
    <TestProviders database={database} queryClient={queryClient}>
      <EditProfileScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )

  return { database, view, queryClient, invalidateSpy }
}

/** The avatar's image source, whatever shape the image component stores it in. */
function avatarSource(): string {
  return JSON.stringify(screen.getByLabelText("Ramil Santos's avatar").props.source ?? null)
}

/** A promise the test resolves or rejects by hand, to look at the screen mid-request. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockOnline = true
  useAuthStore.setState({
    token: 'tok',
    user: { id: '1', uuid: 'user-me', name: 'Ramil Santos', email: 'ramil@example.com' },
  })
  ;(getMyProfile as jest.Mock).mockResolvedValue(profileFixture())
  ;(updateMyProfile as jest.Mock).mockResolvedValue(profileFixture())
  ;(updateDisplayName as jest.Mock).mockResolvedValue({ name: 'Ramil S.' })
  ;(uploadAvatar as jest.Mock).mockResolvedValue(NEW_PHOTO)
  ;(removeAvatar as jest.Mock).mockResolvedValue(undefined)
  ;(pickAvatar as jest.Mock).mockResolvedValue({ kind: 'picked', file: PICKED })
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

  const queryClient = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )
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
    response: {
      status: 422,
      data: {
        message: 'The given data was invalid.',
        errors: { username: ['That username is taken.'] },
      },
    },
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

// ---------------------------------------------------------------------------
// Artboard 2 of the Profile design (STOURIFY-289)
// ---------------------------------------------------------------------------

describe('the Edit profile layout', () => {
  test('a round-back header titled "Edit profile"', async () => {
    await renderScreen()

    expect(await screen.findByText('Edit profile')).toBeTruthy()

    fireEvent.press(screen.getByLabelText(/back/i))
    expect(navigation.goBack).toHaveBeenCalled()
  })

  test('the header "Save" saves exactly what "Save changes" saves', async () => {
    await renderScreen()

    fireEvent.changeText(await screen.findByTestId('edit-profile-bio'), 'Now chasing mountains.')
    fireEvent.press(screen.getByText('Save'))

    await waitFor(() =>
      expect(updateMyProfile).toHaveBeenCalledWith({ bio: 'Now chasing mountains.' }),
    )
  })

  test('the photo carries "Change photo", and the name is an editable field', async () => {
    await renderScreen()

    expect(await screen.findByText('Change photo')).toBeTruthy()
    expect(screen.getByTestId('edit-profile-name').props.value).toBe('Ramil Santos')
  })

  test('an "@" is drawn in front of the username', async () => {
    await renderScreen()

    await screen.findByTestId('edit-profile-username')
    expect(screen.getByText('@')).toBeTruthy()
    expect(screen.getByTestId('edit-profile-username').props.value).toBe('santos_ramil')
  })

  test('the bio counter counts, and the bio stops at the server limit of 150', async () => {
    await renderScreen()

    const bio = await screen.findByTestId('edit-profile-bio')
    expect(screen.getByText('19 / 150')).toBeTruthy()
    expect(bio.props.maxLength).toBe(150)

    fireEvent.changeText(bio, 'Short.')
    expect(screen.getByText('6 / 150')).toBeTruthy()
  })

  test('the fields carry the design labels', async () => {
    await renderScreen()

    await screen.findByTestId('edit-profile-username')
    for (const label of ['Display name', 'Username', 'Bio', 'Home city', 'Website', 'Interests']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Your photo (STOURIFY-307)
// ---------------------------------------------------------------------------

describe('changing your photo', () => {
  test('the picked photo shows at once, uploads, then stays as the server’s copy', async () => {
    const upload = deferred<string>()
    ;(uploadAvatar as jest.Mock).mockReturnValue(upload.promise)
    ;(getMyProfile as jest.Mock).mockResolvedValue(profileFixture({ avatar_url: OLD_PHOTO }))

    await renderScreen()
    await screen.findByText('Change photo')
    expect(avatarSource()).toContain(OLD_PHOTO)

    fireEvent.press(screen.getByText('Change photo'))

    // On screen before the server has answered — the card's "show it at once".
    await waitFor(() => expect(avatarSource()).toContain(PICKED.uri))
    expect(uploadAvatar).toHaveBeenCalledWith(PICKED)

    await act(async () => upload.resolve(NEW_PHOTO))

    await waitFor(() => expect(avatarSource()).toContain(NEW_PHOTO))
  })

  test('a new photo reaches every screen that shows you', async () => {
    const { invalidateSpy } = await renderScreen()

    fireEvent.press(await screen.findByText('Change photo'))

    await waitFor(() => expect(uploadAvatar).toHaveBeenCalled())
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['explorer-profile'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['explorer-posts'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feed'] })
    })
    // The instant copy, for anything that reads the signed-in user.
    expect(useAuthStore.getState().user?.avatar).toBe(NEW_PHOTO)
  })

  test('a failed upload puts the old photo back and says so plainly', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(profileFixture({ avatar_url: OLD_PHOTO }))
    ;(uploadAvatar as jest.Mock).mockRejectedValue({
      isAxiosError: true,
      code: 'ERR_NETWORK',
      message: 'Network Error',
    })

    await renderScreen()
    fireEvent.press(await screen.findByText('Change photo'))

    expect(
      await screen.findByText("Couldn't change your photo. Your old one is still there."),
    ).toBeTruthy()
    expect(avatarSource()).toContain(OLD_PHOTO)
    expect(screen.queryByText('Network Error')).toBeNull()
  })

  test("a photo the server refuses shows the server's reason", async () => {
    ;(uploadAvatar as jest.Mock).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: { errors: { avatar: ['The avatar field must not be greater than 5120 kilobytes.'] } },
      },
    })

    await renderScreen()
    fireEvent.press(await screen.findByText('Change photo'))

    expect(
      await screen.findByText('The avatar field must not be greater than 5120 kilobytes.'),
    ).toBeTruthy()
  })

  test('offline, it says a connection is needed and never opens the gallery', async () => {
    mockOnline = false

    await renderScreen()
    fireEvent.press(await screen.findByText('Change photo'))

    expect(await screen.findByText('Changing your photo needs a connection.')).toBeTruthy()
    expect(pickAvatar).not.toHaveBeenCalled()
    expect(uploadAvatar).not.toHaveBeenCalled()
  })

  test('backing out of the gallery changes nothing and sends nothing', async () => {
    ;(pickAvatar as jest.Mock).mockResolvedValue({ kind: 'cancelled' })

    await renderScreen()
    fireEvent.press(await screen.findByText('Change photo'))

    await waitFor(() => expect(pickAvatar).toHaveBeenCalled())
    expect(uploadAvatar).not.toHaveBeenCalled()
  })

  test('a refused photo permission says what to do', async () => {
    ;(pickAvatar as jest.Mock).mockResolvedValue({ kind: 'denied' })

    await renderScreen()
    fireEvent.press(await screen.findByText('Change photo'))

    expect(
      await screen.findByText('Allow Stourify to use your photos to change your picture.'),
    ).toBeTruthy()
  })

  test('"Remove photo" appears only when there is one, and removes it', async () => {
    await renderScreen()
    await screen.findByText('Change photo')
    expect(screen.queryByText('Remove photo')).toBeNull()

    screen.unmount()
    ;(getMyProfile as jest.Mock).mockResolvedValue(profileFixture({ avatar_url: OLD_PHOTO }))
    await renderScreen()

    fireEvent.press(await screen.findByText('Remove photo'))

    await waitFor(() => expect(removeAvatar).toHaveBeenCalled())
    await waitFor(() => expect(avatarSource()).not.toContain(OLD_PHOTO))
  })
})

// ---------------------------------------------------------------------------
// Your display name (STOURIFY-307)
// ---------------------------------------------------------------------------

describe('changing your display name', () => {
  test('a changed name is saved through PUT /me, and only there', async () => {
    await renderScreen()

    fireEvent.changeText(await screen.findByTestId('edit-profile-name'), 'Ramil S.')
    fireEvent.press(screen.getByText('Save changes'))

    await waitFor(() => expect(updateDisplayName).toHaveBeenCalledWith('Ramil S.'))
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled())
    // Nothing else changed, so the profile endpoint has nothing to be told.
    expect(updateMyProfile).not.toHaveBeenCalled()
    expect(useAuthStore.getState().user?.name).toBe('Ramil S.')
  })

  test('an unchanged name is never sent', async () => {
    await renderScreen()

    fireEvent.changeText(await screen.findByTestId('edit-profile-bio'), 'Now chasing mountains.')
    fireEvent.press(screen.getByText('Save changes'))

    await waitFor(() => expect(updateMyProfile).toHaveBeenCalled())
    expect(updateDisplayName).not.toHaveBeenCalled()
  })

  test('a new name and a new bio are both saved, each to its own endpoint', async () => {
    await renderScreen()

    fireEvent.changeText(await screen.findByTestId('edit-profile-name'), 'Ramil S.')
    fireEvent.changeText(screen.getByTestId('edit-profile-bio'), 'Now chasing mountains.')
    fireEvent.press(screen.getByText('Save changes'))

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled())
    expect(updateDisplayName).toHaveBeenCalledWith('Ramil S.')
    expect(updateMyProfile).toHaveBeenCalledWith({ bio: 'Now chasing mountains.' })
  })

  test('a new name reaches your posts and your profile', async () => {
    const { invalidateSpy } = await renderScreen()

    fireEvent.changeText(await screen.findByTestId('edit-profile-name'), 'Ramil S.')
    fireEvent.press(screen.getByText('Save changes'))

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['explorer-profile'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['explorer-posts'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feed'] })
  })

  test("a 422 on the name shows the server's message under the field", async () => {
    ;(updateDisplayName as jest.Mock).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: { errors: { name: ['The name field must not be greater than 255 characters.'] } },
      },
    })

    await renderScreen()

    fireEvent.changeText(await screen.findByTestId('edit-profile-name'), 'x'.repeat(256))
    fireEvent.press(screen.getByText('Save changes'))

    expect(
      await screen.findByText('The name field must not be greater than 255 characters.'),
    ).toBeTruthy()
    expect(navigation.goBack).not.toHaveBeenCalled()
  })

  test('an empty name is refused on the phone and nothing is sent', async () => {
    await renderScreen()

    fireEvent.changeText(await screen.findByTestId('edit-profile-name'), '   ')
    fireEvent.press(screen.getByText('Save changes'))

    expect(await screen.findByText("Your display name can't be empty.")).toBeTruthy()
    expect(updateDisplayName).not.toHaveBeenCalled()
    expect(updateMyProfile).not.toHaveBeenCalled()
  })

  test('offline, Save says a connection is needed and sends nothing', async () => {
    mockOnline = false

    await renderScreen()

    fireEvent.changeText(await screen.findByTestId('edit-profile-name'), 'Ramil S.')
    fireEvent.press(screen.getByText('Save changes'))

    expect(await screen.findByText('Saving needs a connection.')).toBeTruthy()
    expect(updateDisplayName).not.toHaveBeenCalled()
    expect(updateMyProfile).not.toHaveBeenCalled()
  })
})

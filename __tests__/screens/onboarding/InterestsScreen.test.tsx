import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import InterestsScreen from '@/features/onboarding/screens/InterestsScreen'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import { createTestDatabase, seedExplorerProfile } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'

jest.mock('@/sync/scheduler', () => ({ syncNow: jest.fn(async () => undefined) }))
jest.mock('@/shared/api/profiles', () => ({ updateMyProfile: jest.fn(async () => ({})) }))

import { updateMyProfile } from '@/shared/api/profiles'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

beforeEach(() => jest.clearAllMocks())

it('writes the selected interests to the local explorer profile and advances to Home city', async () => {
  const database = createTestDatabase()
  await seedExplorerProfile(database)

  render(
    <TestProviders database={database}>
      <InterestsScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )

  fireEvent.press(screen.getByText('Nature'))
  fireEvent.press(screen.getByText('Food'))
  fireEvent.press(screen.getByText('Continue'))

  await waitFor(() => {
    expect(navigation.navigate).toHaveBeenCalledWith('HomeCity')
  })

  const [profile] = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()
  expect([...profile.interests].sort()).toEqual(['Food', 'Nature'])
})

it('Skip advances to Home city without writing anything', async () => {
  const database = createTestDatabase()
  await seedExplorerProfile(database)

  render(
    <TestProviders database={database}>
      <InterestsScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )

  fireEvent.press(screen.getByText('Skip'))

  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('HomeCity'))

  const [profile] = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()
  expect(profile.interests).toEqual([])
})

/**
 * This test used to assert the opposite — that nothing was written when no
 * local row existed — and in doing so it pinned the bug in place (STOURIFY-82).
 * That is the case a brand-new account is ALWAYS in, so "writes nothing" meant
 * every real first-run selection was discarded. It now goes to the server
 * instead; `persistProfileChoice` owns the choice between the two writers.
 */
it('sends the interests to the server when the local profile has not synced yet', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <InterestsScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )

  fireEvent.press(screen.getByText('Nature'))
  fireEvent.press(screen.getByText('Continue'))

  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('HomeCity'))

  expect(updateMyProfile).toHaveBeenCalledWith({ interests: ['Nature'] })
  expect(await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetchCount()).toBe(0)
})

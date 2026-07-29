import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import InterestsScreen from '@/features/onboarding/screens/InterestsScreen'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import { createTestDatabase, seedExplorerProfile } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'

jest.mock('@/sync/scheduler', () => ({ syncNow: jest.fn(async () => undefined) }))

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

it('never touches the database when no local explorer profile exists yet', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <InterestsScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )

  fireEvent.press(screen.getByText('Nature'))
  fireEvent.press(screen.getByText('Continue'))

  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('HomeCity'))

  expect(await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetchCount()).toBe(0)
})

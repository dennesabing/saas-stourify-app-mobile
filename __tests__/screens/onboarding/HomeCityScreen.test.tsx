import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import HomeCityScreen from '@/features/onboarding/screens/HomeCityScreen'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import { createTestDatabase, seedCity, seedExplorerProfile } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'

jest.mock('@/sync/scheduler', () => ({ syncNow: jest.fn(async () => undefined) }))

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

beforeEach(() => jest.clearAllMocks())

it('shows a still-syncing state, never a bare empty list, when no cities have landed locally yet', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <HomeCityScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText(/still syncing/i)).toBeTruthy())
})

it('reads cities from the local database and writes the selection to the explorer profile', async () => {
  const database = createTestDatabase()
  await seedExplorerProfile(database)
  await seedCity(database, { uuid: 'city-1', serverId: 5, name: 'General Santos' })

  render(
    <TestProviders database={database}>
      <HomeCityScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )

  fireEvent.press(await screen.findByText('General Santos'))
  fireEvent.press(screen.getByText('Continue'))

  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('FollowSuggestions'))

  const [profile] = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()
  expect(profile.homeCityId).toBe(5)
})

it('Skip advances to Follow suggestions without writing anything', async () => {
  const database = createTestDatabase()
  await seedExplorerProfile(database)
  await seedCity(database, { uuid: 'city-1', serverId: 5, name: 'General Santos' })

  render(
    <TestProviders database={database}>
      <HomeCityScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )

  await screen.findByText('General Santos')
  fireEvent.press(screen.getByText('Skip'))

  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('FollowSuggestions'))

  const [profile] = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()
  expect(profile.homeCityId).toBeNull()
})

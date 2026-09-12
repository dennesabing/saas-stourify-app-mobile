import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import HomeCityScreen from '@/features/onboarding/screens/HomeCityScreen'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import { createTestDatabase, seedCity, seedExplorerProfile } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'

jest.mock('@/sync/scheduler', () => ({ syncNow: jest.fn(async () => undefined) }))

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

beforeEach(() => jest.clearAllMocks())

function renderScreen(database = createTestDatabase()) {
  return render(
    <TestProviders database={database}>
      <HomeCityScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )
}

/** Three cities, seeded out of order on purpose, one of them featured. */
async function seedThree(database: ReturnType<typeof createTestDatabase>) {
  await seedCity(database, {
    uuid: 'davao',
    serverId: 7,
    name: 'Davao City',
    slug: 'davao-city',
    region: 'Davao Region',
    country: 'Philippines',
  })
  await seedCity(database, {
    uuid: 'cebu',
    serverId: 8,
    name: 'Cebu City',
    slug: 'cebu-city',
    region: 'Central Visayas',
    country: 'Philippines',
  })
  await seedCity(database, {
    uuid: 'gensan',
    serverId: 5,
    name: 'General Santos City',
    slug: 'general-santos-city',
    region: 'Soccsksargen',
    country: 'Philippines',
    isFeatured: true,
  })
}

it('shows a still-syncing state, never a bare empty list, when no cities have landed locally yet', async () => {
  renderScreen()

  await waitFor(() => expect(screen.getByText(/still syncing/i)).toBeTruthy())
})

it('asks for a home city, as the third of four steps', async () => {
  const database = createTestDatabase()
  await seedThree(database)
  renderScreen(database)

  expect(await screen.findByText('Set your home city')).toBeTruthy()
  expect(screen.getByLabelText('Step 3 of 4')).toBeTruthy()
  expect(screen.getByText('Suggested')).toBeTruthy()
})

/**
 * Drawn on the canvas, deliberately not built: a city has no coordinates to
 * match the phone's position against, and there is no reverse-geocoding
 * service to ask (STOURIFY-287).
 */
it('does not offer to use the current location, which nothing could answer', async () => {
  const database = createTestDatabase()
  await seedThree(database)
  renderScreen(database)

  await screen.findByText('Set your home city')
  expect(screen.queryByText(/current location/i)).toBeNull()
})

it('lists featured cities first, then the rest by name, each with region and country', async () => {
  const database = createTestDatabase()
  await seedThree(database)
  renderScreen(database)

  await screen.findByText('General Santos City')
  const names = screen
    .getAllByTestId(/^city-row-/)
    .map((row) => row.props.testID.replace('city-row-', ''))

  expect(names).toEqual(['gensan', 'cebu', 'davao'])
  expect(screen.getByText('Soccsksargen · Philippines')).toBeTruthy()
})

/** The list is the device's own copy, so narrowing it asks nobody. */
it('narrows the list as you type, from what is already on the phone', async () => {
  const database = createTestDatabase()
  await seedThree(database)
  renderScreen(database)

  await screen.findByText('General Santos City')
  fireEvent.changeText(screen.getByPlaceholderText('Search a city or region'), 'dav')

  expect(screen.getByText('Davao City')).toBeTruthy()
  expect(screen.queryByText('General Santos City')).toBeNull()
  expect(screen.queryByText('Cebu City')).toBeNull()
})

it('matches the region too, and says so when nothing matches', async () => {
  const database = createTestDatabase()
  await seedThree(database)
  renderScreen(database)

  await screen.findByText('General Santos City')
  const search = screen.getByPlaceholderText('Search a city or region')

  fireEvent.changeText(search, 'visayas')
  expect(screen.getByText('Cebu City')).toBeTruthy()
  expect(screen.queryByText('Davao City')).toBeNull()

  fireEvent.changeText(search, 'zzz')
  expect(screen.getByText(/no city matches/i)).toBeTruthy()
})

it('marks the picked row and writes it to the explorer profile', async () => {
  const database = createTestDatabase()
  await seedExplorerProfile(database)
  await seedThree(database)
  renderScreen(database)

  fireEvent.press(await screen.findByText('Davao City'))

  const row = screen.getByTestId('city-row-davao')
  expect(row.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }))
  expect(within(row).getByTestId('city-row-tick')).toBeTruthy()

  fireEvent.press(screen.getByText('Continue'))

  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('FollowSuggestions'))

  const [profile] = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()
  expect(profile.homeCityId).toBe(7)
})

it('Skip advances to Follow suggestions without writing anything', async () => {
  const database = createTestDatabase()
  await seedExplorerProfile(database)
  await seedThree(database)
  renderScreen(database)

  await screen.findByText('General Santos City')
  fireEvent.press(screen.getByText('Skip'))

  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('FollowSuggestions'))

  const [profile] = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()
  expect(profile.homeCityId).toBeNull()
})

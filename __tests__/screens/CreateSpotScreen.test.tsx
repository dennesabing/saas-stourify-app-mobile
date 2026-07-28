import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import CreateSpotScreen from '@/features/create/screens/CreateSpotScreen'
import MySpotsScreen from '@/features/spots/screens/MySpotsScreen'
import type Spot from '@/db/models/Spot'
import { createTestDatabase, markSynced } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/sync/scheduler', () => ({ syncNow: jest.fn(async () => undefined) }))

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

beforeEach(() => {
  jest.clearAllMocks()
})

it('writes the spot straight to the local database and never to the network', async () => {
  const database = createTestDatabase()
  const fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  fireEvent.changeText(screen.getByPlaceholderText('Spot name'), 'Hidden Cove')
  fireEvent.changeText(screen.getByPlaceholderText('Latitude'), '6.1164')
  fireEvent.changeText(screen.getByPlaceholderText('Longitude'), '125.1716')
  fireEvent.press(screen.getByText('Save spot'))

  await waitFor(async () => {
    expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(1)
  })

  expect(fetchSpy).not.toHaveBeenCalled()

  const [spot] = await database.get<Spot>('sto_spots').query().fetch()
  expect(spot.title).toBe('Hidden Cove')
  expect(spot.latitude).toBeCloseTo(6.1164)
  expect(spot.status).toBe('draft')
  expect(spot.isQueued).toBe(true)
  expect(spot.uuid).toBe(spot.id)
})

it('navigates to My Spots after the local write', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  fireEvent.changeText(screen.getByPlaceholderText('Spot name'), 'Kalaklan Point')
  fireEvent.changeText(screen.getByPlaceholderText('Latitude'), '6.2')
  fireEvent.changeText(screen.getByPlaceholderText('Longitude'), '125.2')
  fireEvent.press(screen.getByText('Save spot'))

  await waitFor(() => {
    expect(navigation.navigate).toHaveBeenCalledWith('MySpots')
  })
})

it('shows no loading spinner, because a local write cannot fail for network reasons', () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  expect(screen.queryByTestId('create-spot-loading')).toBeNull()
})

it('validates locally without touching the database', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  fireEvent.press(screen.getByText('Save spot'))

  await waitFor(() => {
    expect(screen.getByText('A spot needs a name of at least 3 characters.')).toBeTruthy()
  })
  expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
})

it('My Spots renders the queued affordance and drops it once the row is synced', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <MySpotsScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  const spot = await database.write(async () =>
    database.get<Spot>('sto_spots').create((row: any) => {
      row._raw.id = 'spot-observed'
      row._raw.uuid = 'spot-observed'
      row._raw.title = 'Observed Spot'
      row._raw.latitude = 1
      row._raw.longitude = 1
      row._raw.status = 'draft'
      row._raw.is_verified = false
      row._raw.reviews_count = 0
      row._raw.saves_count = 0
      row._raw.created_at = 1
      row._raw.updated_at = 1
    }),
  )

  await waitFor(() => {
    expect(screen.getByText('Observed Spot')).toBeTruthy()
    expect(screen.getByText('Queued ↑')).toBeTruthy()
  })

  await markSynced(database, spot)

  await waitFor(() => {
    expect(screen.queryByText('Queued ↑')).toBeNull()
  })
})

it('My Spots shows an empty state before anything is created', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <MySpotsScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('No spots yet')).toBeTruthy()
  })
})

import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { createTestDatabase, seedCity, seedSpot, markSynced } from './support/testDatabase'
import { TestProviders } from './support/TestProviders'
import type Spot from '@/db/models/Spot'

it('gives every test a database with no rows in it', async () => {
  const a = createTestDatabase()
  await seedSpot(a, { uuid: 'spot-a' })
  expect(await a.get<Spot>('sto_spots').query().fetchCount()).toBe(1)

  const b = createTestDatabase()
  expect(await b.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
})

it('seeds a queued spot by default and can mark it synced', async () => {
  const database = createTestDatabase()
  const spot = await seedSpot(database, { uuid: 'spot-b', title: 'Hidden Cove' })

  expect(spot.isQueued).toBe(true)
  expect(spot.title).toBe('Hidden Cove')

  await markSynced(database, spot)

  expect(spot.isQueued).toBe(false)
})

it('seeds a city that a spot can resolve by numeric server id', async () => {
  const database = createTestDatabase()
  await seedCity(database, { uuid: 'city-a', serverId: 7, name: 'General Santos' })
  const spot = await seedSpot(database, { uuid: 'spot-c', cityId: 7 })

  const cities = await spot.city.fetch()

  expect(cities[0].name).toBe('General Santos')
})

it('renders children inside the database, query and theme providers', () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <Text>harness up</Text>
    </TestProviders>,
  )

  expect(screen.getByText('harness up')).toBeTruthy()
})

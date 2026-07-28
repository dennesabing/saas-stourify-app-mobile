import { Alert } from 'react-native'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type Spot from '@/db/models/Spot'
import SyncStatusScreen from '@/features/sync/screens/SyncStatusScreen'
import { upsertSyncFailure } from '@/sync/pushService'
import { resetSyncStatus, useSyncStatusStore } from '@/sync/status'
import { syncNow } from '@/sync/scheduler'
import { createTestDatabase, seedSpot } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/sync/scheduler', () => ({ syncNow: jest.fn(async () => undefined) }))

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

beforeEach(() => {
  jest.clearAllMocks()
  resetSyncStatus()
})

it('shows an offline write in the queue with no sync cycle having run', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  // The store still reports zero — nothing has published queue state, because
  // no cycle has run. The screen must read the database, not the store.
  expect(useSyncStatusStore.getState().pendingCount).toBe(0)

  await waitFor(() => {
    expect(screen.getByText('New spot · Hidden Cove')).toBeTruthy()
    expect(screen.getByText('Pending uploads')).toBeTruthy()
    expect(screen.getByText('1 change waiting to sync')).toBeTruthy()
  })
})

it('shows a rejection with the server error and both actions', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1',
    tableName: 'sto_spots',
    reason: 'validation',
    lastError: JSON.stringify({ title: ['The title field is required.'] }),
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('Needs your attention')).toBeTruthy()
    expect(screen.getByText('Rejected: The title field is required. · 1 attempt')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
    expect(screen.getByText('Discard')).toBeTruthy()
  })
})

it('retrying a row clears its failure and runs a cycle', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1', tableName: 'sto_spots', reason: 'validation', lastError: '{}',
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy())
  fireEvent.press(screen.getByText('Retry'))

  await waitFor(() => {
    expect(screen.queryByText('Needs your attention')).toBeNull()
    expect(syncNow).toHaveBeenCalled()
  })
})

it('discarding asks first, then destroys the row permanently', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1', tableName: 'sto_spots', reason: 'validation', lastError: '{}',
  })

  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const discard = (buttons ?? []).find((button) => button.text === 'Discard')
    void discard?.onPress?.()
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('Discard')).toBeTruthy())
  fireEvent.press(screen.getByText('Discard'))

  await waitFor(async () => {
    expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
  })

  expect(alertSpy).toHaveBeenCalled()
  expect(await database.adapter.getDeletedRecords('sto_spots')).toHaveLength(0)

  alertSpy.mockRestore()
})

it('retry all clears every failure and runs a cycle', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1', tableName: 'sto_spots', reason: 'validation', lastError: '{}',
  })

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('Retry all now')).toBeTruthy())
  fireEvent.press(screen.getByText('Retry all now'))

  await waitFor(() => {
    expect(screen.queryByText('Needs your attention')).toBeNull()
    expect(syncNow).toHaveBeenCalled()
  })
})

it('hides retry-all when there is nothing queued', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => expect(screen.getByText('Everything is synced')).toBeTruthy())
  expect(screen.queryByText('Retry all now')).toBeNull()
})

it('shows the empty state when the queue is clean', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('All changes synced')).toBeTruthy()
    expect(screen.getByText('Everything is synced')).toBeTruthy()
  })
})

it('goes back to Settings', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <SyncStatusScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  fireEvent.press(screen.getByLabelText('Back to Settings'))
  expect(navigation.goBack).toHaveBeenCalled()
})

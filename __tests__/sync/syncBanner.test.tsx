import { render, screen } from '@testing-library/react-native'
import SyncBanner, { resolveBannerState } from '@/features/sync/components/SyncBanner'
import { resetSyncStatus, useSyncStatusStore } from '@/sync/status'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

const NOW = 1_700_000_000_000

beforeEach(() => {
  resetSyncStatus()
})

it('syncing outranks everything', () => {
  const state = resolveBannerState({
    phase: 'draining',
    offline: true,
    pending: 3,
    failed: 2,
    lastSyncedAt: NOW,
    now: NOW,
  })

  expect(state.tone).toBe('primary')
  expect(state.title).toBe('Syncing…')
  expect(state.subtitle).toBe('3 changes to send')
})

it('syncing with an empty queue says it is checking', () => {
  const state = resolveBannerState({
    phase: 'pulling',
    offline: false,
    pending: 0,
    failed: 0,
    lastSyncedAt: NOW,
    now: NOW,
  })

  expect(state.subtitle).toBe('Checking for updates')
})

it('offline outranks a pending queue, because pending while offline is normal', () => {
  const state = resolveBannerState({
    phase: 'idle',
    offline: true,
    pending: 2,
    failed: 0,
    lastSyncedAt: NOW,
    now: NOW,
  })

  expect(state.tone).toBe('muted')
  expect(state.title).toBe("You're offline")
  expect(state.subtitle).toBe("2 changes waiting · they'll send when you reconnect")
})

it('offline with nothing queued says so', () => {
  const state = resolveBannerState({
    phase: 'idle',
    offline: true,
    pending: 0,
    failed: 0,
    lastSyncedAt: NOW,
    now: NOW,
  })

  expect(state.subtitle).toBe('Nothing waiting to send')
})

it('failures outrank a plain pending queue', () => {
  const state = resolveBannerState({
    phase: 'idle',
    offline: false,
    pending: 3,
    failed: 1,
    lastSyncedAt: NOW - 12 * 60_000,
    now: NOW,
  })

  expect(state.tone).toBe('accent')
  expect(state.title).toBe('1 change needs your attention')
  expect(state.subtitle).toBe('3 waiting · last synced 12 minutes ago')
})

it('pluralizes the attention title', () => {
  const state = resolveBannerState({
    phase: 'idle',
    offline: false,
    pending: 2,
    failed: 2,
    lastSyncedAt: NOW,
    now: NOW,
  })

  expect(state.title).toBe('2 changes need your attention')
})

it('a plain pending queue', () => {
  const state = resolveBannerState({
    phase: 'idle',
    offline: false,
    pending: 1,
    failed: 0,
    lastSyncedAt: NOW,
    now: NOW,
  })

  expect(state.tone).toBe('primary')
  expect(state.title).toBe('1 change waiting to sync')
  expect(state.subtitle).toBe('Last synced just now')
})

it('an empty, online, idle queue is fully synced', () => {
  const state = resolveBannerState({
    phase: 'idle',
    offline: false,
    pending: 0,
    failed: 0,
    lastSyncedAt: NOW,
    now: NOW,
  })

  expect(state.tone).toBe('success')
  expect(state.title).toBe('All changes synced')
  expect(state.subtitle).toBe('Last synced just now')
})

it('says so when it has never synced', () => {
  const state = resolveBannerState({
    phase: 'idle',
    offline: false,
    pending: 0,
    failed: 0,
    lastSyncedAt: null,
    now: NOW,
  })

  expect(state.subtitle).toBe('Not synced yet')
})

it('renders the resolved state from the store', () => {
  useSyncStatusStore.getState().setOffline(true)

  render(
    <TestProviders database={createTestDatabase()}>
      <SyncBanner pending={2} failed={0} />
    </TestProviders>,
  )

  expect(screen.getByText("You're offline")).toBeTruthy()
  expect(screen.getByText("2 changes waiting · they'll send when you reconnect")).toBeTruthy()
})

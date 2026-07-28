import { resetSyncStatus, useSyncStatusStore } from '@/sync/status'

beforeEach(() => {
  resetSyncStatus()
})

it('starts idle, online, never synced and with nothing pending', () => {
  const state = useSyncStatusStore.getState()

  expect(state.phase).toBe('idle')
  expect(state.offline).toBe(false)
  expect(state.lastSyncedAt).toBeNull()
  expect(state.pendingCount).toBe(0)
  expect(state.failures).toEqual([])
  expect(state.lastError).toBeNull()
})

it('tracks the phase through a cycle', () => {
  useSyncStatusStore.getState().setPhase('draining')
  expect(useSyncStatusStore.getState().phase).toBe('draining')

  useSyncStatusStore.getState().setPhase('pulling')
  expect(useSyncStatusStore.getState().phase).toBe('pulling')

  useSyncStatusStore.getState().setPhase('idle')
  expect(useSyncStatusStore.getState().phase).toBe('idle')
})

it('records a successful pull with its timestamp and row count', () => {
  useSyncStatusStore.getState().recordPull(42)
  useSyncStatusStore.getState().markSynced(1_700_000_000_000)

  expect(useSyncStatusStore.getState().lastPulledRows).toBe(42)
  expect(useSyncStatusStore.getState().lastSyncedAt).toBe(1_700_000_000_000)
})

it('clears the last error when a later cycle succeeds', () => {
  useSyncStatusStore.getState().setLastError('HTTP 500')
  expect(useSyncStatusStore.getState().lastError).toBe('HTTP 500')

  useSyncStatusStore.getState().setLastError(null)
  expect(useSyncStatusStore.getState().lastError).toBeNull()
})

it('surfaces the queue depth and the failure list M2c renders', () => {
  useSyncStatusStore.getState().setPendingCount(3)
  useSyncStatusStore.getState().setFailures([
    { recordId: 'spot-1', tableName: 'sto_spots', reason: 'validation', attempts: 1, lastError: 'title is required' },
  ])

  expect(useSyncStatusStore.getState().pendingCount).toBe(3)
  expect(useSyncStatusStore.getState().failures[0].reason).toBe('validation')
})

it('resetSyncStatus wipes everything, which logout depends on', () => {
  useSyncStatusStore.getState().setPendingCount(9)
  useSyncStatusStore.getState().setOffline(true)
  useSyncStatusStore.getState().markSynced(1)
  useSyncStatusStore.getState().setLastError('boom')
  useSyncStatusStore.getState().setFailures([
    { recordId: 'spot-1', tableName: 'sto_spots', reason: 'validation', attempts: 1, lastError: 'title is required' },
  ])
  useSyncStatusStore.getState().setPhase('pulling')

  resetSyncStatus()

  const state = useSyncStatusStore.getState()
  expect(state.pendingCount).toBe(0)
  expect(state.offline).toBe(false)
  expect(state.lastSyncedAt).toBeNull()
  expect(state.lastError).toBeNull()
  expect(state.failures).toEqual([])
  expect(state.phase).toBe('idle')
})

it('going offline mid-cycle does not implicitly change the phase', () => {
  useSyncStatusStore.getState().setPhase('pulling')
  useSyncStatusStore.getState().setOffline(true)

  const state = useSyncStatusStore.getState()
  expect(state.phase).toBe('pulling')
  expect(state.offline).toBe(true)
})

it('a failed cycle records lastError without clobbering pendingCount from a prior cycle', () => {
  useSyncStatusStore.getState().setPendingCount(5)
  useSyncStatusStore.getState().setLastError('network unreachable')

  const state = useSyncStatusStore.getState()
  expect(state.pendingCount).toBe(5)
  expect(state.lastError).toBe('network unreachable')
})

it('markSynced clears a stale lastError so the UI cannot show success beside a past failure', () => {
  useSyncStatusStore.getState().setLastError('HTTP 500')
  useSyncStatusStore.getState().markSynced(123)

  expect(useSyncStatusStore.getState().lastError).toBeNull()
  expect(useSyncStatusStore.getState().lastSyncedAt).toBe(123)
})

it('setFailures replaces the list rather than appending to it', () => {
  useSyncStatusStore.getState().setFailures([
    { recordId: 'spot-1', tableName: 'sto_spots', reason: 'validation', attempts: 1, lastError: 'title is required' },
  ])
  useSyncStatusStore.getState().setFailures([
    { recordId: 'spot-2', tableName: 'sto_spots', reason: 'conflict', attempts: 2, lastError: 'stale version' },
  ])

  const { failures } = useSyncStatusStore.getState()
  expect(failures).toHaveLength(1)
  expect(failures[0].recordId).toBe('spot-2')
})

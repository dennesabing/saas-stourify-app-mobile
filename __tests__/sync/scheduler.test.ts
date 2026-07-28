import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { startSyncScheduler, syncNow } from '@/sync/scheduler'
import { runSyncCycle } from '@/sync/cycle'
import { useSyncStatusStore, resetSyncStatus } from '@/sync/status'
import { createTestDatabase } from '../support/testDatabase'

jest.mock('@/sync/cycle', () => ({
  runSyncCycle: jest.fn(async ({ trigger }: { trigger: string }) => ({
    trigger,
    skipped: null,
    drain: { attempted: 0, acked: 0, rejected: 0, excluded: 0, fullyAcked: true, networkFailure: false, error: null },
    pulled: true,
    pulledRows: 0,
    error: null,
  })),
  isSyncInFlight: jest.fn(() => false),
}))

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
    addEventListener: jest.fn(() => jest.fn()),
  },
}))

const mockRunSyncCycle = runSyncCycle as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  resetSyncStatus()
})

it('syncs when connectivity is regained, but not when it is lost', () => {
  const database = createTestDatabase()
  let notify: ((state: any) => void) | null = null
  ;(NetInfo.addEventListener as jest.Mock).mockImplementation((cb: (s: any) => void) => {
    notify = cb
    return jest.fn()
  })

  const stop = startSyncScheduler(database)

  notify!({ isConnected: false, isInternetReachable: false })
  expect(mockRunSyncCycle).not.toHaveBeenCalled()
  expect(useSyncStatusStore.getState().offline).toBe(true)

  notify!({ isConnected: true, isInternetReachable: true })
  expect(mockRunSyncCycle).toHaveBeenCalledWith({ database, trigger: 'connectivity' })
  expect(useSyncStatusStore.getState().offline).toBe(false)

  stop()
})

it('syncs when the app returns to the foreground, but not on every state change', () => {
  const database = createTestDatabase()
  const listeners: ((state: string) => void)[] = []
  const remove = jest.fn()
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb: any) => {
    listeners.push(cb)
    return { remove } as any
  })

  const stop = startSyncScheduler(database)

  listeners[0]('background')
  expect(mockRunSyncCycle).not.toHaveBeenCalled()

  listeners[0]('active')
  expect(mockRunSyncCycle).toHaveBeenCalledWith({ database, trigger: 'foreground' })

  listeners[0]('active')
  expect(mockRunSyncCycle).toHaveBeenCalledTimes(1)

  stop()
  expect(remove).toHaveBeenCalled()
})

it('syncNow runs a manual cycle by default', async () => {
  const database = createTestDatabase()

  await syncNow(database)

  expect(mockRunSyncCycle).toHaveBeenCalledWith({ database, trigger: 'manual' })
})

it('syncNow can be told it is the post-login cycle', async () => {
  const database = createTestDatabase()

  await syncNow(database, 'login')

  expect(mockRunSyncCycle).toHaveBeenCalledWith({ database, trigger: 'login' })
})

it('stopping the scheduler removes both subscriptions', () => {
  const database = createTestDatabase()
  const netInfoUnsubscribe = jest.fn()
  const appStateRemove = jest.fn()
  ;(NetInfo.addEventListener as jest.Mock).mockReturnValue(netInfoUnsubscribe)
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: appStateRemove } as any)

  startSyncScheduler(database)()

  expect(netInfoUnsubscribe).toHaveBeenCalled()
  expect(appStateRemove).toHaveBeenCalled()
})

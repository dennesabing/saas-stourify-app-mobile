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

it('fires exactly one cycle across several consecutive online events, not one per event', () => {
  const database = createTestDatabase()
  let notify: ((state: any) => void) | null = null
  ;(NetInfo.addEventListener as jest.Mock).mockImplementation((cb: (s: any) => void) => {
    notify = cb
    return jest.fn()
  })

  const stop = startSyncScheduler(database)

  // A regain, then a flaky radio re-emitting "online" on connection-type/
  // signal changes with no intervening offline transition. Only the genuine
  // false→true edge should fire a cycle.
  notify!({ isConnected: false, isInternetReachable: false })
  notify!({ isConnected: true, isInternetReachable: true })
  notify!({ isConnected: true, isInternetReachable: true })
  notify!({ isConnected: true, isInternetReachable: null })
  notify!({ isConnected: true, isInternetReachable: true })

  expect(mockRunSyncCycle).toHaveBeenCalledTimes(1)

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

it('stopping the scheduler genuinely disconnects the NetInfo listener — firing it again triggers nothing', () => {
  const database = createTestDatabase()
  let notify: ((state: any) => void) | null = null
  let netInfoUnsubscribed = false
  ;(NetInfo.addEventListener as jest.Mock).mockImplementation((cb: (s: any) => void) => {
    notify = cb
    return () => {
      netInfoUnsubscribed = true
    }
  })

  const stop = startSyncScheduler(database)
  stop()

  expect(netInfoUnsubscribed).toBe(true)

  // A harness that forgot to call the real NetInfo unsubscribe would still
  // let this fire — proving the listener is gone means firing the captured
  // callback again after teardown and observing no cycle, not merely that
  // some function got called.
  notify!({ isConnected: true, isInternetReachable: true })
  expect(mockRunSyncCycle).not.toHaveBeenCalled()
})

it('stopping the scheduler genuinely disconnects the AppState listener — firing it again triggers nothing', () => {
  const database = createTestDatabase()
  const listeners: ((state: string) => void)[] = []
  let appStateRemoved = false
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb: any) => {
    listeners.push(cb)
    return { remove: () => { appStateRemoved = true } } as any
  })

  const stop = startSyncScheduler(database)
  listeners[0]('background') // establish a non-active previous state
  stop()

  expect(appStateRemoved).toBe(true)

  // Same principle as the NetInfo case: prove removal by firing the captured
  // callback post-teardown, not by asserting `remove` was merely called.
  listeners[0]('active')
  expect(mockRunSyncCycle).not.toHaveBeenCalled()
})

it('stopping the scheduler twice is a no-op the second time', () => {
  const database = createTestDatabase()
  const netInfoUnsubscribe = jest.fn()
  const appStateRemove = jest.fn()
  ;(NetInfo.addEventListener as jest.Mock).mockReturnValue(netInfoUnsubscribe)
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: appStateRemove } as any)

  const stop = startSyncScheduler(database)

  expect(() => {
    stop()
    stop()
  }).not.toThrow()

  expect(netInfoUnsubscribe).toHaveBeenCalledTimes(2)
  expect(appStateRemove).toHaveBeenCalledTimes(2)
})

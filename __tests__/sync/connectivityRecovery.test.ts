/**
 * The connectivity seam's recovery probe (STOURIFY-134).
 *
 * The bug these tests pin down: the seam used to learn about the network ONLY
 * when NetInfo volunteered an event. A shop that only hears the street is
 * closed because somebody shouted it through the door stays shut all day,
 * because nobody shouts again when the street reopens. On a real handset that
 * is exactly what happens — the reachability probe answers "no" during a radio
 * transition and NetInfo never speaks again, so the queue never drains.
 *
 * So the thing under test is not "does it read the right value" but "does it
 * ever ask again". Every test here therefore drives recovery through
 * `NetInfo.refresh()` — the probe — and never through a second event.
 */
import type NetInfoModule from '@react-native-community/netinfo'

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
    refresh: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
    addEventListener: jest.fn(() => jest.fn()),
  },
}))

type Seam = typeof import('@/sync/seams/connectivity')
type NetInfoState = { isConnected: boolean | null; isInternetReachable: boolean | null }

let seam: Seam
let NetInfo: typeof NetInfoModule
/** Every NetInfo listener the seam registered, newest last. */
let emitters: ((state: NetInfoState) => void)[]
/** How many of the seam's NetInfo subscriptions have been torn down. */
let netInfoUnsubscribes: number

/** Lets the promise `NetInfo.refresh()` returns settle before we assert. */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  jest.resetModules()
  jest.useFakeTimers()
  emitters = []
  netInfoUnsubscribes = 0

  NetInfo = require('@react-native-community/netinfo').default
  ;(NetInfo.addEventListener as jest.Mock).mockImplementation((cb: (s: NetInfoState) => void) => {
    emitters.push(cb)
    return () => {
      netInfoUnsubscribes += 1
    }
  })
  ;(NetInfo.refresh as jest.Mock).mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  })

  seam = require('@/sync/seams/connectivity')
})

afterEach(() => {
  jest.useRealTimers()
})

it('recovers on its own when NetInfo goes quiet after a wrongly-negative reading', async () => {
  const seen: boolean[] = []
  const unsubscribe = seam.netInfoConnectivity.subscribe((online) => seen.push(online))

  // The exact reading the handset produced: the radio is up, and the
  // reachability probe that went out mid-transition came back "no".
  emitters[0]({ isConnected: true, isInternetReachable: false })
  expect(seam.netInfoConnectivity.isOnline()).toBe(false)
  expect(seen).toEqual([false])

  // The network really comes back — and NetInfo says nothing about it. This is
  // the whole bug: no second event ever arrives.
  jest.advanceTimersByTime(seam.RECOVERY_PROBE_INTERVAL_MS)
  await settle()

  expect(NetInfo.refresh).toHaveBeenCalled()
  expect(seam.netInfoConnectivity.isOnline()).toBe(true)
  expect(seen).toEqual([false, true])

  unsubscribe()
})

it('does not probe at all while it believes it is online', () => {
  const unsubscribe = seam.netInfoConnectivity.subscribe(() => {})

  emitters[0]({ isConnected: true, isInternetReachable: true })
  jest.advanceTimersByTime(seam.RECOVERY_PROBE_INTERVAL_MS * 10)

  expect(NetInfo.refresh).not.toHaveBeenCalled()

  unsubscribe()
})

it('stops probing once it has recovered, rather than polling for the rest of the session', async () => {
  const unsubscribe = seam.netInfoConnectivity.subscribe(() => {})

  emitters[0]({ isConnected: false, isInternetReachable: false })
  jest.advanceTimersByTime(seam.RECOVERY_PROBE_INTERVAL_MS)
  await settle()

  expect(seam.netInfoConnectivity.isOnline()).toBe(true)
  const callsAtRecovery = (NetInfo.refresh as jest.Mock).mock.calls.length

  jest.advanceTimersByTime(seam.RECOVERY_PROBE_INTERVAL_MS * 10)
  await settle()

  expect((NetInfo.refresh as jest.Mock).mock.calls.length).toBe(callsAtRecovery)

  unsubscribe()
})

it('keeps probing while the network is genuinely still down', async () => {
  ;(NetInfo.refresh as jest.Mock).mockResolvedValue({
    isConnected: false,
    isInternetReachable: false,
  })

  const seen: boolean[] = []
  const unsubscribe = seam.netInfoConnectivity.subscribe((online) => seen.push(online))

  emitters[0]({ isConnected: false, isInternetReachable: false })

  jest.advanceTimersByTime(seam.RECOVERY_PROBE_INTERVAL_MS * 3)
  await settle()

  expect((NetInfo.refresh as jest.Mock).mock.calls.length).toBe(3)
  expect(seam.netInfoConnectivity.isOnline()).toBe(false)
  // Three probes, all agreeing with what we already believed, must not look
  // like three transitions to anybody listening.
  expect(seen).toEqual([false])

  unsubscribe()
})

it('a failed probe is not evidence of anything and does not disturb the flag', async () => {
  ;(NetInfo.refresh as jest.Mock).mockRejectedValue(new Error('probe blew up'))

  const seen: boolean[] = []
  const unsubscribe = seam.netInfoConnectivity.subscribe((online) => seen.push(online))

  emitters[0]({ isConnected: false, isInternetReachable: false })

  jest.advanceTimersByTime(seam.RECOVERY_PROBE_INTERVAL_MS * 2)
  await settle()

  expect(seam.netInfoConnectivity.isOnline()).toBe(false)
  expect(seen).toEqual([false])

  unsubscribe()
})

it('stops probing when the last subscriber goes away', async () => {
  const unsubscribe = seam.netInfoConnectivity.subscribe(() => {})

  emitters[0]({ isConnected: false, isInternetReachable: false })
  unsubscribe()

  expect(netInfoUnsubscribes).toBe(1)

  jest.advanceTimersByTime(seam.RECOVERY_PROBE_INTERVAL_MS * 5)
  await settle()

  expect(NetInfo.refresh).not.toHaveBeenCalled()
})

it('one probe notifies every subscriber exactly once', async () => {
  const first: boolean[] = []
  const second: boolean[] = []
  const stopFirst = seam.netInfoConnectivity.subscribe((online) => first.push(online))
  const stopSecond = seam.netInfoConnectivity.subscribe((online) => second.push(online))

  // Both subscriptions are registered with NetInfo, so a real event arrives
  // down two paths. It must still read as one transition.
  emitters.forEach((emit) => emit({ isConnected: true, isInternetReachable: false }))
  expect(first).toEqual([false])
  expect(second).toEqual([false])

  jest.advanceTimersByTime(seam.RECOVERY_PROBE_INTERVAL_MS)
  await settle()

  expect(first).toEqual([false, true])
  expect(second).toEqual([false, true])

  stopFirst()
  stopSecond()
})

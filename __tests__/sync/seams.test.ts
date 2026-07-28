import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { asyncStorageKv } from '@/sync/seams/kv'
import { authTokenStore } from '@/sync/seams/tokenStore'
import { netInfoConnectivity } from '@/sync/seams/connectivity'
import { useAuthStore } from '@/shared/store/auth'

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
}))

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
    addEventListener: jest.fn(() => jest.fn()),
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({ token: null, user: null })
})

describe('asyncStorageKv', () => {
  it('reads, writes and removes through AsyncStorage', async () => {
    await asyncStorageKv.setItem('sync:last_pulled_at:module:stourify', '2026-07-28T00:00:00+00:00')
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'sync:last_pulled_at:module:stourify',
      '2026-07-28T00:00:00+00:00',
    )

    await asyncStorageKv.getItem('sync:last_pulled_at:module:stourify')
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('sync:last_pulled_at:module:stourify')

    await asyncStorageKv.removeItem('sync:last_pulled_at:module:stourify')
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('sync:last_pulled_at:module:stourify')
  })
})

describe('authTokenStore', () => {
  it('reads the ONE token from the auth store, not a second copy', async () => {
    useAuthStore.setState({ token: 'tok-123' })
    expect(await authTokenStore.get()).toBe('tok-123')
  })

  it('returns null when there is no session', async () => {
    expect(await authTokenStore.get()).toBeNull()
  })

  it('writing a token goes through setToken so SecureStore stays authoritative', async () => {
    await authTokenStore.set('tok-456')
    expect(useAuthStore.getState().token).toBe('tok-456')
  })

  it('writing null clears the session', async () => {
    useAuthStore.setState({ token: 'tok-789' })
    await authTokenStore.set(null)
    expect(useAuthStore.getState().token).toBeNull()
  })
})

describe('netInfoConnectivity', () => {
  it('starts optimistic and tracks the NetInfo signal', () => {
    expect(netInfoConnectivity.isOnline()).toBe(true)
  })

  it('notifies subscribers when connectivity changes and stops on unsubscribe', () => {
    const listeners: ((state: any) => void)[] = []
    ;(NetInfo.addEventListener as jest.Mock).mockImplementation((cb: (s: any) => void) => {
      listeners.push(cb)
      return () => {
        listeners.length = 0
      }
    })

    const seen: boolean[] = []
    const unsubscribe = netInfoConnectivity.subscribe((online) => seen.push(online))

    listeners[0]({ isConnected: false, isInternetReachable: false })
    listeners[0]({ isConnected: true, isInternetReachable: true })

    expect(seen).toEqual([false, true])
    expect(netInfoConnectivity.isOnline()).toBe(true)

    unsubscribe()
    expect(listeners).toHaveLength(0)
  })
})

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { useAuthStore } from '@/shared/store/auth'
import { onLogin, signOut } from '@/sync/session'
import { resetSyncStatus, useSyncStatusStore } from '@/sync/status'
import { syncHttpClient } from '@/sync/httpClient'
import { createTestDatabase, seedSpot } from '../support/testDatabase'
import type Spot from '@/db/models/Spot'

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>()
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      setItem: jest.fn((k: string, v: string) => {
        store.set(k, v)
        return Promise.resolve()
      }),
      removeItem: jest.fn((k: string) => {
        store.delete(k)
        return Promise.resolve()
      }),
    },
  }
})

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
}))

jest.mock('@/shared/navigation/ref', () => ({ navigateTo: jest.fn() }))

// `onLogin` runs a real sync cycle (`syncNow` → `runSyncCycle`), which would
// otherwise dispatch a real HTTP request through `syncHttpClient` with no
// server behind it, per `__tests__/sync/scheduler.test.ts`'s established
// pattern for this exact seam.
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

const ANA = { id: '1', uuid: 'user-uuid-1', name: 'Ana', email: 'ana@test.com' }

beforeEach(async () => {
  jest.clearAllMocks()
  resetSyncStatus()
  useAuthStore.setState({ token: null, user: null })
  await AsyncStorage.removeItem('stourify_user')
})

describe('the auth store', () => {
  it('persists the user to AsyncStorage while the token stays in SecureStore', async () => {
    useAuthStore.getState().setToken('tok-1')
    useAuthStore.getState().setUser(ANA)

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('stourify_token', 'tok-1')
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('stourify_user', JSON.stringify(ANA))
  })

  it('restores BOTH the token and the user at boot', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('tok-restored')
    await AsyncStorage.setItem('stourify_user', JSON.stringify(ANA))

    await useAuthStore.getState().loadFromStorage()

    expect(useAuthStore.getState().token).toBe('tok-restored')
    expect(useAuthStore.getState().user?.uuid).toBe('user-uuid-1')
  })

  it('survives a corrupted persisted user rather than crashing the boot', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('tok-restored')
    await AsyncStorage.setItem('stourify_user', '{not json')

    await useAuthStore.getState().loadFromStorage()

    expect(useAuthStore.getState().token).toBe('tok-restored')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('clearAuth removes the persisted user too', async () => {
    useAuthStore.getState().setUser(ANA)

    useAuthStore.getState().clearAuth()

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('stourify_user')
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('signOut', () => {
  it('wipes the local database so the next account inherits nothing', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-previous-user' })
    useAuthStore.setState({ token: 'tok', user: ANA })

    await signOut(database)

    expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('removes the module cursor, so the next user gets a full backfill', async () => {
    const database = createTestDatabase()
    await AsyncStorage.setItem('sync:last_pulled_at:module:stourify', '2026-07-28T00:00:00+00:00')

    await signOut(database)

    expect(await AsyncStorage.getItem('sync:last_pulled_at:module:stourify')).toBeNull()
  })

  it('resets the sync status the Offline screens read', async () => {
    const database = createTestDatabase()
    useSyncStatusStore.getState().setPendingCount(4)
    useSyncStatusStore.getState().markSynced(1)

    await signOut(database)

    expect(useSyncStatusStore.getState().pendingCount).toBe(0)
    expect(useSyncStatusStore.getState().lastSyncedAt).toBeNull()
  })
})

describe('onLogin', () => {
  it('re-arms the auth latch so a 401 after a re-login is not swallowed', async () => {
    const database = createTestDatabase()
    // A static import, not the brief's `await import(...)`: this project's
    // jest/babel setup (jest-expo's metro-caller babel preset) does not
    // transform dynamic `import()` into a jest-compatible require — confirmed
    // with a standalone repro that fails identically on ANY dynamically
    // imported module, not just this one. A static import spied via
    // `jest.spyOn` exercises the exact same assertion (the real
    // `syncHttpClient` singleton's `resetAuthGuard` was called by `onLogin`)
    // without depending on runtime ESM support this environment lacks.
    const spy = jest.spyOn(syncHttpClient, 'resetAuthGuard')

    await onLogin(database)

    expect(spy).toHaveBeenCalled()
  })
})

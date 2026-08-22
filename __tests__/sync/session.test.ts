import type { Database } from '@nozbe/watermelondb'
import { QueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { useAuthStore } from '@/shared/store/auth'
import * as dbModule from '@/db'
import { installSyncSessionHandlers, onLogin, signOut } from '@/sync/session'
import { resetSyncStatus, useSyncStatusStore } from '@/sync/status'
import { syncHttpClient } from '@/sync/httpClient'
import { createTestDatabase, seedSpot, seedCity } from '../support/testDatabase'
import { SYNCED_TABLES } from '@/db/schema'
import { trackQueryClient } from '../support/queryClients'

// No inline AsyncStorage mock: the root `__mocks__/@react-native-async-storage/
// async-storage.js` (Task 12) auto-applies to every test that imports it, and
// is a real stateful in-memory store — a hand-rolled `Map`-based mock here
// would just duplicate it.
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
  // The AsyncStorage mock is a module-level singleton shared by every test in
  // this file (per the established pattern in `cycle.test.ts`) — clear it
  // fully rather than one key at a time.
  await AsyncStorage.clear()
})

/**
 * One row in every synced table, plus a `sync_failures` row — the residue
 * test needs proof that `wipeDatabase()` empties ALL of them, not just
 * `sto_spots`.
 */
async function seedEverySyncedTableAndFailure(database: Database): Promise<void> {
  await seedSpot(database, { uuid: 'spot-previous-user' })
  await seedCity(database, { uuid: 'city-previous-user' })

  await database.write(async () => {
    await database.get('sto_reviews').create((row: any) => {
      row._raw.id = 'review-previous-user'
      row._raw.uuid = 'review-previous-user'
      row._raw.rating = 5
      row._raw.helpful_count = 0
      row._raw.created_at = 1_700_000_000_000
      row._raw.updated_at = 1_700_000_000_000
    })

    await database.get('sto_wishlist_items').create((row: any) => {
      row._raw.id = 'wishlist-previous-user'
      row._raw.uuid = 'wishlist-previous-user'
      row._raw.is_downloaded_offline = false
      row._raw.created_at = 1_700_000_000_000
      row._raw.updated_at = 1_700_000_000_000
    })

    await database.get('sto_follows').create((row: any) => {
      row._raw.id = 'follow-previous-user'
      row._raw.uuid = 'follow-previous-user'
      row._raw.status = 'accepted'
      row._raw.created_at = 1_700_000_000_000
      row._raw.updated_at = 1_700_000_000_000
    })

    await database.get('sto_explorer_profiles').create((row: any) => {
      row._raw.id = 'explorer-previous-user'
      row._raw.uuid = 'explorer-previous-user'
      row._raw.username = 'previous-user'
      row._raw.spots_count = 0
      row._raw.followers_count = 0
      row._raw.following_count = 0
      row._raw.is_private = false
      row._raw.shows_location_on_spots = true
      row._raw.created_at = 1_700_000_000_000
      row._raw.updated_at = 1_700_000_000_000
    })

    await database.get('sync_failures').create((row: any) => {
      row._raw.id = 'failure-previous-user'
      row._raw.record_id = 'spot-previous-user'
      row._raw.table_name = 'sto_spots'
      row._raw.reason = 'validation'
      row._raw.attempts = 1
      row._raw.last_error = 'stale test residue'
      row._raw.failed_at = 1_700_000_000_000
    })
  })
}

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
  it('wipes every synced table and sync_failures, so the next account inherits nothing', async () => {
    const database = createTestDatabase()
    await seedEverySyncedTableAndFailure(database)
    useAuthStore.setState({ token: 'tok', user: ANA })

    await signOut(database)

    for (const table of SYNCED_TABLES) {
      expect(await database.get(table).query().fetchCount()).toBe(0)
    }
    expect(await database.get('sync_failures').query().fetchCount()).toBe(0)
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('clears the React Query cache so the next account does not see stale screens', async () => {
    const database = createTestDatabase()
    const qc = trackQueryClient(new QueryClient())
    // Any real cached key will do — this test is about signOut() emptying the
    // cache, not about which screen filled it. It used `['account-settings']`
    // until STOURIFY-156 deleted the feature behind that key, and a test
    // standing on a key nothing writes any more slowly stops meaning anything.
    qc.setQueryData(['explorer-profile', 'me'], { username: 'ziv' })
    expect(qc.getQueryData(['explorer-profile', 'me'])).toEqual({ username: 'ziv' })

    await signOut(database, qc)

    expect(qc.getQueryData(['explorer-profile', 'me'])).toBeUndefined()
    expect(qc.getQueryCache().getAll()).toHaveLength(0)
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

  it('stops the scheduler before wiping the database on logout', async () => {
    const database = createTestDatabase()
    const order: string[] = []
    const stopScheduler = jest.fn(() => order.push('stop'))

    const wipeSpy = jest.spyOn(dbModule, 'wipeDatabase').mockImplementation(async () => {
      order.push('wipe')
    })

    installSyncSessionHandlers(database, stopScheduler)
    await signOut(database)

    expect(stopScheduler).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['stop', 'wipe'])

    wipeSpy.mockRestore()
  })

  it('signs out cleanly when no scheduler was ever registered', async () => {
    const database = createTestDatabase()

    installSyncSessionHandlers(database)

    await expect(signOut(database)).resolves.toBeUndefined()
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

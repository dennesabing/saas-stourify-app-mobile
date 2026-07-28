import AsyncStorage from '@react-native-async-storage/async-storage'
import type { KeyValueStore } from '@soxerp/offline-sync-core'

/**
 * The engine's cursor store (`seams.ts:2-6`).
 *
 * Holds `sync:last_pulled_at:module:stourify` — a PER-MODULE key
 * (`syncEngine.ts:24`), not per-table. The value is the server's `server_time`
 * verbatim, which is why the cursor is immune to client clock drift.
 *
 * AsyncStorage, not SecureStore: a cursor is not a secret, and SecureStore's
 * per-item keychain round-trip is far slower.
 */
export const asyncStorageKv: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
}

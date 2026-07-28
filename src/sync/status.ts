import { create } from 'zustand'

export type SyncPhase = 'idle' | 'draining' | 'pulling'

export interface SyncFailureSummary {
  recordId: string
  tableName: string
  reason: string
  attempts: number
  lastError: string
}

interface SyncStatusState {
  phase: SyncPhase
  offline: boolean
  /** Epoch ms of the last fully successful cycle. */
  lastSyncedAt: number | null
  /** Rows currently dirty in the local database — the queue depth. */
  pendingCount: number
  failures: SyncFailureSummary[]
  lastError: string | null
  lastPulledRows: number

  setPhase: (phase: SyncPhase) => void
  setOffline: (offline: boolean) => void
  setPendingCount: (count: number) => void
  setFailures: (failures: SyncFailureSummary[]) => void
  setLastError: (message: string | null) => void
  recordPull: (rows: number) => void
  markSynced: (at: number) => void
}

const INITIAL = {
  phase: 'idle' as SyncPhase,
  offline: false,
  lastSyncedAt: null as number | null,
  pendingCount: 0,
  failures: [] as SyncFailureSummary[],
  lastError: null as string | null,
  lastPulledRows: 0,
}

/**
 * What the sync layer observed, for the UI to render.
 *
 * It exists because `runPullSync()` resolves `void` and swallows every error
 * into a `console.warn` (`syncEngine.ts:88-90`) — at the call site, total
 * failure is indistinguishable from success. The observed-client wrapper in
 * `engine.ts` (Task 10) writes here; M2c's Offline & Sync screens read here.
 * Those screens are out of scope for M2b: this store gives them real data to
 * render, it does not render it.
 *
 * This is a plain state container with explicit setters — it never reaches
 * into the database, the engine, or the HTTP client. State is pushed in by
 * later tasks; it pulls nothing.
 */
export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  ...INITIAL,

  setPhase: (phase) => set({ phase }),
  setOffline: (offline) => set({ offline }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setFailures: (failures) => set({ failures }),
  setLastError: (lastError) => set({ lastError }),
  recordPull: (lastPulledRows) => set({ lastPulledRows }),
  markSynced: (lastSyncedAt) => set({ lastSyncedAt }),
}))

/** Called on logout, alongside wiping the database and resetting the cursors. */
export function resetSyncStatus(): void {
  useSyncStatusStore.setState({ ...INITIAL })
}

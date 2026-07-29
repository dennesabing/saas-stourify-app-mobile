import { Database } from '@nozbe/watermelondb'
import type { DatabaseAdapter } from '@nozbe/watermelondb/adapters/type'
import { stourifySchema } from './schema'
import { stourifyMigrations } from './migrations'
import City from './models/City'
import ExplorerProfile from './models/ExplorerProfile'
import Follow from './models/Follow'
import PendingMedia from './models/PendingMedia'
import Review from './models/Review'
import Spot from './models/Spot'
import SyncFailure from './models/SyncFailure'
import WishlistItem from './models/WishlistItem'

export { default as City } from './models/City'
export { default as ExplorerProfile } from './models/ExplorerProfile'
export { default as Follow } from './models/Follow'
export { default as PendingMedia } from './models/PendingMedia'
export { default as Review } from './models/Review'
export { default as Spot } from './models/Spot'
export { default as SyncFailure } from './models/SyncFailure'
export { default as WishlistItem } from './models/WishlistItem'

export const modelClasses = [
  Spot,
  Review,
  WishlistItem,
  Follow,
  ExplorerProfile,
  City,
  SyncFailure,
  PendingMedia,
]

/**
 * Builds a database over any adapter. The app passes SQLite; tests pass LokiJS,
 * which runs in Node — which is why the entire sync layer is testable under jest
 * with no device and no native module.
 */
export function createDatabase(adapter: DatabaseAdapter): Database {
  return new Database({ adapter, modelClasses })
}

let nativeDatabase: Database | null = null

/**
 * The app's single SQLite-backed database. Created on first call.
 *
 * `SQLiteAdapter` is required lazily, INSIDE this function, not at module top
 * level. It pulls in the native SQLite binding; requiring it eagerly meant
 * every jest file that touched `@/db` — even indirectly, even just for
 * `createDatabase`/`modelClasses` — dragged the native adapter into the Node
 * process and left an open handle that kept the test runner alive forever.
 * `getDatabase()` is never called from tests (they call `createDatabase()`
 * with a LokiJS adapter instead), so deferring the require here keeps native
 * SQLite out of the jest process entirely.
 */
export function getDatabase(): Database {
  if (nativeDatabase === null) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SQLiteAdapter = require('@nozbe/watermelondb/adapters/sqlite').default
    nativeDatabase = createDatabase(
      new SQLiteAdapter({
        schema: stourifySchema,
        migrations: stourifyMigrations,
        jsi: true,
        dbName: 'stourify',
      }),
    )
  }
  return nativeDatabase
}

/**
 * Drops every local row.
 *
 * Called on logout: without it the next account to log in on this device
 * inherits the previous user's rows.
 */
export async function wipeDatabase(database: Database): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase()
  })
}

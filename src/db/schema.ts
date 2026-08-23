import { appSchema, tableSchema, type AppSchema } from '@nozbe/watermelondb'

/**
 * The synced table set — the server's names, VERBATIM
 * (`modules/Stourify/src/Support/Sync/SyncRegistry.php:34-42`).
 *
 * The engine matches delta response keys to these by exact string and silently
 * skips a table it cannot find (`syncEngine.ts:74-76`): no error, no warning. A
 * locally renamed table is not a mismatch you will see; it is a table that never
 * syncs.
 */
export const SYNCED_TABLES = [
  'sto_spots',
  'sto_reviews',
  'sto_wishlist_items',
  'sto_follows',
  'sto_explorer_profiles',
  'sto_cities',
] as const

export type SyncedTable = (typeof SYNCED_TABLES)[number]

/**
 * Columns come straight from `SyncSerializer::COLUMNS`, with three deliberate
 * differences:
 *
 * 1. the server's numeric `id` is stored as `server_id`, because the local record
 *    id IS the server uuid. The engine writes `server_id` directly onto `_raw`,
 *    bypassing the sanitizer, and only when the server sent `id` as a JSON number
 *    (`syncEngine.ts:51`). Undeclared means silently lost.
 * 2. JSON columns (`categories`, `hours`, `interests`) are `string` columns
 *    holding JSON text. `buildSchemaSanitizer` coerces a `string` column with
 *    `String(v)`, which would flatten an array to "a,b" — so `createSanitizeRaw`
 *    (Task 10) JSON-encodes these BEFORE delegating to the package sanitizer.
 * 3. four local-only companion uuid columns exist because the delta speaks ids
 *    and the push speaks uuids. A review or wishlist item can reference a spot the
 *    caller does not own, which the delta deliberately excludes (M2a §2) — so
 *    there is no local row to resolve a uuid from. The server never sends these,
 *    and the sanitizer skips any column absent from the raw row, so a pull never
 *    clobbers them.
 */
export const stourifySchema: AppSchema = appSchema({
  version: 3,
  tables: [
    tableSchema({
      name: 'sto_spots',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'number', isOptional: true, isIndexed: true },
        { name: 'organization_id', type: 'number', isOptional: true },
        { name: 'user_id', type: 'number', isOptional: true },
        { name: 'city_id', type: 'number', isOptional: true },
        { name: 'city_uuid', type: 'string', isOptional: true },
        { name: 'owner_user_id', type: 'number', isOptional: true },
        { name: 'title', type: 'string' },
        { name: 'slug', type: 'string', isOptional: true },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'categories', type: 'string', isOptional: true },
        { name: 'hours', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'is_verified', type: 'boolean' },
        { name: 'rating_average', type: 'number', isOptional: true },
        { name: 'reviews_count', type: 'number' },
        { name: 'saves_count', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'sto_reviews',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'number', isOptional: true, isIndexed: true },
        { name: 'organization_id', type: 'number', isOptional: true },
        { name: 'user_id', type: 'number', isOptional: true },
        { name: 'spot_id', type: 'number', isOptional: true },
        { name: 'spot_uuid', type: 'string', isOptional: true },
        { name: 'rating', type: 'number' },
        { name: 'body', type: 'string', isOptional: true },
        { name: 'helpful_count', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'sto_wishlist_items',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'number', isOptional: true, isIndexed: true },
        { name: 'organization_id', type: 'number', isOptional: true },
        { name: 'user_id', type: 'number', isOptional: true },
        { name: 'spot_id', type: 'number', isOptional: true },
        { name: 'spot_uuid', type: 'string', isOptional: true },
        { name: 'city_id', type: 'number', isOptional: true },
        { name: 'note', type: 'string', isOptional: true },
        { name: 'is_downloaded_offline', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sto_follows',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'number', isOptional: true, isIndexed: true },
        { name: 'organization_id', type: 'number', isOptional: true },
        { name: 'follower_id', type: 'number', isOptional: true },
        { name: 'followee_id', type: 'number', isOptional: true },
        { name: 'followee_uuid', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'accepted_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sto_explorer_profiles',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'number', isOptional: true, isIndexed: true },
        { name: 'organization_id', type: 'number', isOptional: true },
        { name: 'user_id', type: 'number', isOptional: true },
        { name: 'home_city_id', type: 'number', isOptional: true },
        { name: 'username', type: 'string' },
        { name: 'bio', type: 'string', isOptional: true },
        { name: 'website', type: 'string', isOptional: true },
        { name: 'interests', type: 'string', isOptional: true },
        { name: 'spots_count', type: 'number' },
        { name: 'followers_count', type: 'number' },
        { name: 'following_count', type: 'number' },
        { name: 'is_private', type: 'boolean' },
        { name: 'shows_location_on_spots', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sto_cities',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'number', isOptional: true, isIndexed: true },
        { name: 'organization_id', type: 'number', isOptional: true },
        { name: 'name', type: 'string' },
        { name: 'slug', type: 'string' },
        { name: 'region', type: 'string', isOptional: true },
        { name: 'country', type: 'string', isOptional: true },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'spot_count', type: 'number' },
        { name: 'is_featured', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true },
      ],
    }),
    // Local only — never in SYNCED_TABLES, never pushed, never pulled. It
    // carries exactly what WatermelonDB's own `_status`/`_changed` dirty
    // tracking lacks. `table_name`, not `table`: `table` is a SQL reserved word.
    tableSchema({
      name: 'sync_failures',
      columns: [
        { name: 'record_id', type: 'string', isIndexed: true },
        { name: 'table_name', type: 'string' },
        { name: 'reason', type: 'string' },
        { name: 'attempts', type: 'number' },
        { name: 'last_error', type: 'string' },
        { name: 'failed_at', type: 'number' },
      ],
    }),
    // Local only — never in SYNCED_TABLES, never pushed, never pulled. The
    // offline media outbox: bytes are copied into app-private storage at
    // capture time (`queueLocalMedia`) and recorded here; a second drain
    // phase presigns, PUTs and attaches them once their host row is acked.
    // Added in schema v2 via a MIGRATION (`src/db/migrations.ts`), not a
    // destructive reset — a reset would discard un-drained offline writes,
    // exactly the data this project exists to protect.
    tableSchema({
      name: 'pending_media',
      columns: [
        // Morph alias (e.g. `stourify_spot`), not FQCN — `AllowedMorph` on
        // the backend validates the alias.
        { name: 'host_type', type: 'string' },
        // The host row's uuid; `attach` resolves the host by it.
        { name: 'host_uuid', type: 'string', isIndexed: true },
        // App-private copy of the bytes — never the picker/camera URI.
        { name: 'local_path', type: 'string' },
        { name: 'filename', type: 'string' },
        { name: 'mime', type: 'string' },
        // Advisory only; the server enforces its own ceiling at attach.
        { name: 'size', type: 'number' },
        // 'pending' | 'uploading' | 'failed'
        { name: 'state', type: 'string', isIndexed: true },
        { name: 'attempts', type: 'number' },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    /**
     * Local-only, like `pending_media` above: never in `SYNCED_TABLES`, never
     * pushed, never pulled. It holds a post somebody started writing and has
     * not shared yet (STOURIFY-159).
     *
     * `media` is a `string` column holding JSON — the same shape the compose
     * route takes, `{ uri, type, fileName }[]`. JSON rather than a child table
     * because nothing ever queries a draft BY its photos; the list is read and
     * written whole, with the draft.
     *
     * `spot_title` duplicates a title that lives on the spot row. That is
     * deliberate: the Drafts page has to name a tagged spot with no network,
     * and a spot the author tagged may not be in the local database at all.
     */
    tableSchema({
      name: 'post_drafts',
      columns: [
        { name: 'caption', type: 'string' },
        { name: 'visibility', type: 'string' },
        { name: 'spot_uuid', type: 'string', isOptional: true },
        { name: 'spot_title', type: 'string', isOptional: true },
        { name: 'media', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number', isIndexed: true },
      ],
    }),
  ],
})

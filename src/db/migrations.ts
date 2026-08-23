import { createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations'

/**
 * v1 -> v2 adds `pending_media`, the local-only offline media outbox; v2 -> v3
 * adds `post_drafts`, the local-only store of posts somebody started and has
 * not shared (both described in `schema.ts`). This MUST be a migration, never a
 * destructive schema-version bump: a reset (`unsafeResetDatabase`) would wipe every un-drained offline
 * write on an existing install — precisely the data this project exists to
 * protect. `stepsForMigration.js`/the adapter's `validateAdapter` refuses to
 * open a schema at version N without migrations covering up to N, so this
 * must be passed to every adapter alongside `stourifySchema`.
 */
export const stourifyMigrations = schemaMigrations({
  migrations: [
    {
      toVersion: 3,
      steps: [
        createTable({
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
    },
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'pending_media',
          columns: [
            { name: 'host_type', type: 'string' },
            { name: 'host_uuid', type: 'string', isIndexed: true },
            { name: 'local_path', type: 'string' },
            { name: 'filename', type: 'string' },
            { name: 'mime', type: 'string' },
            { name: 'size', type: 'number' },
            { name: 'state', type: 'string', isIndexed: true },
            { name: 'attempts', type: 'number' },
            { name: 'last_error', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
})

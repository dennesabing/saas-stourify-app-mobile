import { createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations'

/**
 * v1 -> v2: adds `pending_media`, the local-only offline media outbox (see
 * `schema.ts`). This MUST be a migration, never a destructive schema-version
 * bump: a reset (`unsafeResetDatabase`) would wipe every un-drained offline
 * write on an existing install — precisely the data this project exists to
 * protect. `stepsForMigration.js`/the adapter's `validateAdapter` refuses to
 * open a schema at version N without migrations covering up to N, so this
 * must be passed to every adapter alongside `stourifySchema`.
 */
export const stourifyMigrations = schemaMigrations({
  migrations: [
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

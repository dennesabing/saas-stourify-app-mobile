# M2a wire fixtures

These two files are **captured from a running M2a server**, never hand-written. A hand-written
fixture only proves the client agrees with itself — which is the exact failure mode the sync
milestone must rule out.

| File | Source | Envelope |
|---|---|---|
| `m2a-delta.json` | `GET /api/v1/stourify/sync/delta` via `modules/Stourify/bruno/11-sync/01-delta.bru`, `since` disabled | none — the payload is the top-level body |
| `m2a-push-response.json` | `POST /api/v1/stourify/sync/push` via `modules/Stourify/bruno/11-sync/02-push.bru`, second run | `{ data: { results, server_time } }` |

**Provenance note:** the delta was reproduced with `curl`, not the Bruno GUI, and — unlike
`01-delta.bru:21-23` — the request **omitted** the `X-Organization-Id` header, relying instead on
the `current_organization_id` fallback in `SetOrganizationFromHeader.php:44-48`. That is a
different middleware branch than the Bruno file specifies. For a single-org user (the case
captured here) both branches resolve to the same organization, so the body is expected to be
byte-identical to a capture that does send the header; it has not been separately verified against
the header-bearing branch.

## What was actually captured

The dev database (`dennes_stourify`) had zero rows in all six `sto_*` tables, so the delta came
back empty on every bucket. Rather than `migrate:fresh --seed` (forbidden — this is the user's real
working database), one row per synced table was created through the module's own Eloquent
factories against the existing user `su@xio.com` (id 1) and their organization (id 1):
one `City` (General Santos), one `Spot`, one `Review`, one `WishlistItem`, one `ExplorerProfile`,
and one `Follow` (to a freshly factory-created second user, since a follow needs two sides). See
the task report for the exact ids/uuids created and how to clean them up.

The push fixture's request body goes beyond the Bruno file's minimal single-field example to
exercise the FK-translation contract deliberately: it pushes a spot with a `city_uuid`, a review
and a wishlist item each with a `spot_uuid`, a follow with a `user_uuid`, and an `updated` op
against the existing explorer profile with a `home_city_uuid` — so the response's numeric
`city_id` / `spot_id` / `followee_id` / `home_city_id` visibly resolve from the client-sent uuids.
The profile op is an update against the row already in the DB (no new row created). It was POSTed
twice; the second run's raw body is what's saved here, proving idempotency (same record ids,
same `op`/`status: "ok"` both times).

## Regenerating

1. Bring up the backend (do **not** run a destructive migration against a real dev database —
   only `migrate:fresh --seed` against a disposable/test database is safe for a from-scratch
   capture).
2. Mint a token and read the org uuid with `php artisan tinker`.
3. In Bruno set `base_url`, `token` and `org_uuid`, run `01-delta.bru` once and `02-push.bru` twice
   (or replay the equivalent raw HTTP requests — see the task report for the exact `curl` commands
   used here).
4. Save the raw response bodies over the two files above.
5. `cd mobile && npm test -- __tests__/fixturesShape.test.ts` must pass.

`sto_cities.created` must contain at least one row — the sanitizer test needs a row with a numeric
`id`.

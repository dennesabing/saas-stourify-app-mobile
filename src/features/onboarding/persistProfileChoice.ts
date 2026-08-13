import type { Database } from '@nozbe/watermelondb'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import { updateMyProfile } from '@/shared/api/profiles'
import { syncNow } from '@/sync/scheduler'

/**
 * One onboarding answer, in both the encodings it has to be written in.
 *
 * The two writers below do not address a city the same way: the local table
 * stores the numeric `server_id`, while `PATCH /profile` takes the city's uuid.
 * Carrying both on the choice is what lets the caller stay ignorant of which
 * writer will run.
 */
export type OnboardingChoice =
  | { kind: 'interests'; interests: string[] }
  | { kind: 'homeCity'; cityServerId: number; cityUuid: string }

/**
 * Save an onboarding answer, wherever it can currently be saved.
 *
 * **The bug this replaces (STOURIFY-82).** Both saving screens wrote straight
 * into the local copy of `sto_explorer_profiles` and both were wrapped in
 * `if (profiles.length > 0)`. That guard is never true for a brand-new
 * account — nothing has synced a profile row down yet — so for the one user
 * onboarding exists to serve, every answer was silently dropped. A save
 * guarded on the thing it is supposed to be saving never runs.
 *
 * **Why two paths rather than one.** Writing locally is the better path and
 * stays the default: it works with no connection, and the sync queue pushes it
 * later exactly as it does a spot created in a tunnel. It is simply not
 * available yet on someone's first minute. Registration now creates the profile
 * server-side, so when the local row has not arrived the answer can go straight
 * to `PATCH /profile` — which needs no handle, because the row already exists.
 *
 * **Failures are swallowed on purpose.** This is four taps on somebody's first
 * thirty seconds in the app, and the answers are preferences that tune a feed.
 * Blocking the flow on a flaky connection would be a worse bug than the one
 * being fixed; a lost preference leaves them exactly where they were before
 * this function existed, and Edit Profile can set it later.
 */
export async function persistProfileChoice(
  database: Database,
  choice: OnboardingChoice,
): Promise<void> {
  if (choice.kind === 'interests' && choice.interests.length === 0) {
    return
  }

  const profiles = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()

  if (profiles.length > 0) {
    await database.write(async () => {
      await profiles[0].update((row: any) => {
        if (choice.kind === 'interests') {
          row._setRaw('interests', JSON.stringify(choice.interests))
        } else {
          row._setRaw('home_city_id', choice.cityServerId)
        }
      })
    })

    // A nudge, not a dependency: the row is already durable locally.
    void syncNow(database)

    return
  }

  try {
    await updateMyProfile(
      choice.kind === 'interests'
        ? { interests: choice.interests }
        : { home_city_uuid: choice.cityUuid },
    )
  } catch {
    // See the note above: onboarding advances regardless.
  }
}

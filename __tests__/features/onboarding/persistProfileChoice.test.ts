import type ExplorerProfile from '@/db/models/ExplorerProfile'
import { createTestDatabase, seedExplorerProfile } from '../../support/testDatabase'

jest.mock('@/sync/scheduler', () => ({ syncNow: jest.fn(async () => undefined) }))
jest.mock('@/shared/api/profiles', () => ({ updateMyProfile: jest.fn(async () => ({})) }))

import { persistProfileChoice } from '@/features/onboarding/persistProfileChoice'
import { updateMyProfile } from '@/shared/api/profiles'
import { syncNow } from '@/sync/scheduler'

beforeEach(() => jest.clearAllMocks())

/**
 * The seam this file holds is WHICH of the two writers runs (STOURIFY-82).
 *
 * Onboarding used to write only into the local database, guarded on a row
 * already being there — and for the account it exists to serve, a brand-new
 * one, that row is never there yet. So the guard was false every single time
 * and the user's answers went nowhere. Asserting on the fallback is the whole
 * point: an implementation that quietly does nothing passes no test here.
 */
describe('with a local profile row already synced down', () => {
  it('writes locally and does not call the network', async () => {
    const database = createTestDatabase()
    await seedExplorerProfile(database)

    await persistProfileChoice(database, { kind: 'interests', interests: ['Food', 'Nature'] })

    const [profile] = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()
    expect([...profile.interests].sort()).toEqual(['Food', 'Nature'])
    expect(updateMyProfile).not.toHaveBeenCalled()
    expect(syncNow).toHaveBeenCalled()
  })

  it('writes the home city by its numeric server id', async () => {
    const database = createTestDatabase()
    await seedExplorerProfile(database)

    await persistProfileChoice(database, {
      kind: 'homeCity',
      cityServerId: 42,
      cityUuid: 'city-uuid',
    })

    const [profile] = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()
    expect(profile.homeCityId).toBe(42)
    expect(updateMyProfile).not.toHaveBeenCalled()
  })
})

describe('before the local profile row has arrived', () => {
  it('sends the interests to the server instead of dropping them', async () => {
    const database = createTestDatabase()

    await persistProfileChoice(database, { kind: 'interests', interests: ['Food'] })

    expect(updateMyProfile).toHaveBeenCalledWith({ interests: ['Food'] })
  })

  // The API addresses a home city by UUID; the local write path addresses the
  // same city by its numeric server id. Sending the wrong one is a 422 the
  // caller never sees, because this write is best-effort.
  it('sends the home city by uuid, not by server id', async () => {
    const database = createTestDatabase()

    await persistProfileChoice(database, {
      kind: 'homeCity',
      cityServerId: 42,
      cityUuid: 'city-uuid',
    })

    expect(updateMyProfile).toHaveBeenCalledWith({ home_city_uuid: 'city-uuid' })
  })

  /**
   * Onboarding is four taps on somebody's first thirty seconds in the app. A
   * failed save of an optional preference must not strand them on a screen —
   * so the caller is told nothing and the flow continues. The choice is lost,
   * which is exactly what happened before this existed, and no worse.
   */
  it('does not throw when the request fails, so onboarding still advances', async () => {
    const database = createTestDatabase()
    ;(updateMyProfile as jest.Mock).mockRejectedValueOnce(new Error('offline'))

    await expect(
      persistProfileChoice(database, { kind: 'interests', interests: ['Food'] }),
    ).resolves.toBeUndefined()
  })
})

it('writes nothing at all for an empty choice', async () => {
  const database = createTestDatabase()

  await persistProfileChoice(database, { kind: 'interests', interests: [] })

  expect(updateMyProfile).not.toHaveBeenCalled()
})

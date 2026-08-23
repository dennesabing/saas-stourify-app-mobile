/**
 * The photo copying is asserted in `draftPhotoStore.test.ts` against a stand-in
 * filesystem. Here it is stubbed, so these tests can say the store is CALLED
 * and go on being about the drafts themselves (STOURIFY-160).
 */
jest.mock('@/features/social/api/draftPhotoStore', () => ({
  copyDraftPhotos: jest.fn(async (draftId: string, photos: any[]) =>
    photos.map((photo, index) => ({ ...photo, uri: `file:///kept/${draftId}-${index}.jpg` })),
  ),
  deleteDraftPhotos: jest.fn(async () => undefined),
}))

import { firstValueFrom } from 'rxjs'
import type { Database } from '@nozbe/watermelondb'
import { createTestDatabase } from '../../support/testDatabase'
import { copyDraftPhotos, deleteDraftPhotos } from '@/features/social/api/draftPhotoStore'
import {
  DEFAULT_VISIBILITY,
  deleteDraft,
  findDraft,
  isWorthSaving,
  observeDrafts,
  saveDraft,
  type DraftContent,
} from '@/features/social/api/postDrafts'

function content(overrides: Partial<DraftContent> = {}): DraftContent {
  return {
    caption: '',
    visibility: DEFAULT_VISIBILITY,
    spotUuid: null,
    spotTitle: null,
    media: [
      {
        uri: 'file:///cache/photo.jpg',
        fileName: 'photo.jpg',
        type: 'image/jpeg',
      },
    ],
    ...overrides,
  }
}

describe('isWorthSaving', () => {
  it('says no to a screen nobody has touched', () => {
    expect(isWorthSaving(content())).toBe(false)
  })

  it('says no to whitespace, which is not something anybody wrote', () => {
    expect(isWorthSaving(content({ caption: '   ' }))).toBe(false)
  })

  it('says yes to a typed caption', () => {
    expect(isWorthSaving(content({ caption: 'Sunset at the pier' }))).toBe(true)
  })

  it('says yes to a tagged spot', () => {
    expect(isWorthSaving(content({ spotUuid: 'spot-1', spotTitle: 'The Pier' }))).toBe(true)
  })

  it('says yes to an audience the author moved off the default', () => {
    expect(isWorthSaving(content({ visibility: 'public' }))).toBe(true)
  })
})

describe('saveDraft', () => {
  let database: Database

  beforeEach(() => {
    database = createTestDatabase()
  })

  it('writes what the author had, and reads it back whole', async () => {
    const id = await saveDraft(
      database,
      content({
        caption: 'Sunset',
        visibility: 'public',
        spotUuid: 'spot-1',
        spotTitle: 'The Pier',
      }),
    )

    const draft = await findDraft(database, id)

    expect(draft).not.toBeNull()
    expect(draft?.caption).toBe('Sunset')
    expect(draft?.visibility).toBe('public')
    expect(draft?.spotUuid).toBe('spot-1')
    expect(draft?.spotTitle).toBe('The Pier')
    // The address is the app's own copy, not the picker's — see the
    // `keeping the photos` block below (STOURIFY-160).
    expect(draft?.media).toEqual([
      {
        uri: `file:///kept/${id}-0.jpg`,
        fileName: 'photo.jpg',
        type: 'image/jpeg',
      },
    ])
  })

  it('updates the same draft rather than leaving a copy behind', async () => {
    const id = await saveDraft(database, content({ caption: 'Sun' }))
    const same = await saveDraft(database, content({ caption: 'Sunset at the pier' }), id)

    expect(same).toBe(id)
    expect(await database.get('post_drafts').query().fetchCount()).toBe(1)
    expect((await findDraft(database, id))?.caption).toBe('Sunset at the pier')
  })

  it('starts a new draft when the id it was given is gone', async () => {
    const id = await saveDraft(database, content({ caption: 'First' }))
    await deleteDraft(database, id)

    const replacement = await saveDraft(database, content({ caption: 'Second' }), id)

    expect(replacement).not.toBe(id)
    expect(await database.get('post_drafts').query().fetchCount()).toBe(1)
  })
})

describe('observeDrafts', () => {
  it('hands back the most recently touched first', async () => {
    const database = createTestDatabase()
    // Three saves inside one millisecond would all carry the same timestamp,
    // and then the order is whatever the store happens to return. Step the
    // clock so the test asserts the sort rather than a coincidence.
    let clock = 1_700_000_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1_000))

    const older = await saveDraft(database, content({ caption: 'Older' }))
    await saveDraft(database, content({ caption: 'Newer' }))
    // Touching the older one again moves it to the front.
    await saveDraft(database, content({ caption: 'Older, edited' }), older)

    const drafts = await firstValueFrom(observeDrafts(database))

    expect(drafts.map((draft) => draft.caption)).toEqual(['Older, edited', 'Newer'])

    jest.restoreAllMocks()
  })
})

/**
 * The one the live run caught. A plain `observe()` re-emits when a row is added
 * or removed and stays silent when one is edited, so a Drafts page left open
 * kept showing the caption from before the edit — and looked right again as
 * soon as anybody navigated away and back.
 */
it('tells a list that is already open when a draft is edited', async () => {
  const database = createTestDatabase()
  // Step the clock: the query re-emits on `updated_at` changing, and two saves
  // inside one millisecond carry the same value. Real saves are at least a
  // debounce apart.
  let clock = 1_700_000_000_000
  jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1_000))
  const seen: string[][] = []
  const subscription = observeDrafts(database).subscribe((rows) => {
    seen.push(rows.map((row) => row.caption))
  })

  const id = await saveDraft(database, content({ caption: 'First words' }))
  await saveDraft(database, content({ caption: 'Second thoughts' }), id)

  // Wait for the emission rather than for a fixed tick: a save now does more
  // than one write (the photos are copied and the row corrected), so a
  // hard-coded delay is a race dressed up as a test.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (seen[seen.length - 1]?.[0] === 'Second thoughts') break
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  subscription.unsubscribe()

  expect(seen[seen.length - 1]).toEqual(['Second thoughts'])
  jest.restoreAllMocks()
})

describe('keeping the photos', () => {
  it('stores the copy the phone owns, not the address the picker handed over', async () => {
    const database = createTestDatabase()

    const id = await saveDraft(database, content({ caption: 'With a photo' }))

    expect(copyDraftPhotos).toHaveBeenCalled()
    expect((await findDraft(database, id))?.media[0].uri).toBe(`file:///kept/${id}-0.jpg`)
  })

  it('takes the copies with it when the draft goes', async () => {
    const database = createTestDatabase()
    const id = await saveDraft(database, content({ caption: 'Throwaway' }))

    await deleteDraft(database, id)

    expect(deleteDraftPhotos).toHaveBeenCalledWith([
      expect.objectContaining({ uri: `file:///kept/${id}-0.jpg` }),
    ])
  })
})

describe('deleteDraft', () => {
  it('removes the draft', async () => {
    const database = createTestDatabase()
    const id = await saveDraft(database, content({ caption: 'Throwaway' }))

    await deleteDraft(database, id)

    expect(await findDraft(database, id)).toBeNull()
    expect(await database.get('post_drafts').query().fetchCount()).toBe(0)
  })

  it('is happy deleting one that is already gone', async () => {
    const database = createTestDatabase()

    await expect(deleteDraft(database, 'never-existed')).resolves.toBeUndefined()
  })
})

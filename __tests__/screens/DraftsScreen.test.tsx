import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Database } from '@nozbe/watermelondb'
import DraftsScreen from '@/features/social/screens/DraftsScreen'
import * as postDrafts from '@/features/social/api/postDrafts'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

const { saveDraft } = postDrafts
/** Captured before any test spies on it, so a spy can always call the real one. */
const realDeleteDraft = postDrafts.deleteDraft

const navigation = { navigate: jest.fn() }

const PHOTO = [
  {
    uri: 'file:///tmp/photo_0.jpg',
    type: 'image/jpeg',
    fileName: 'photo_0.jpg',
  },
]

beforeEach(() => {
  jest.clearAllMocks()
})

function renderScreen(database: Database) {
  return render(
    <TestProviders database={database}>
      <DraftsScreen navigation={navigation as any} />
    </TestProviders>,
  )
}

/**
 * Presses a Delete button, then waits until the delete has FINISHED — on the
 * handler's own promise, never on a clock (STOURIFY-282).
 *
 * This test used to poll `waitFor(() => expect(title).toBeNull())` against a
 * one-second budget. The delete takes about five milliseconds, but each poll
 * that lands before the re-draw FAILS, and a failing `expect` pretty-prints the
 * element it received — which carries React's whole internal tree. That costs
 * about 600 ms on this host, so the budget held one failed poll on a quiet
 * machine and none on a busy one.
 *
 * So wait for the finish line instead. The button's only job is `deleteDraft`;
 * when its promise settles, the write has committed. WatermelonDB tells its
 * subscribers inside the write, so the screen's re-query was already queued by
 * then, and the adapter answers in the order asked — our one read returns only
 * after the screen has its answer, and `act` draws it. Nothing here is timed.
 */
async function pressDeleteAndSettle(
  database: Database,
  target: Parameters<typeof fireEvent.press>[0],
): Promise<void> {
  let finished: Promise<void> | undefined
  const spy = jest.spyOn(postDrafts, 'deleteDraft').mockImplementation((db, id) => {
    finished = realDeleteDraft(db, id)
    return finished
  })
  try {
    fireEvent.press(target)
    // Without this a press that never reached deleteDraft would await nothing and pass.
    expect(finished).toBeDefined()
    await act(async () => {
      await finished
      await database.get('post_drafts').query().fetchCount()
    })
  } finally {
    spy.mockRestore()
  }
}

it('says there is nothing here only once it has actually looked', async () => {
  const database = createTestDatabase()
  renderScreen(database)

  await waitFor(() => {
    expect(screen.getByText('No drafts')).toBeTruthy()
  })
})

it('lists what is waiting, most recently touched first', async () => {
  const database = createTestDatabase()
  let clock = 1_700_000_000_000
  jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1_000))

  await saveDraft(database, {
    caption: 'Older',
    visibility: 'private',
    media: PHOTO,
  })
  await saveDraft(database, {
    caption: 'Newer',
    visibility: 'private',
    spotUuid: 'spot-1',
    spotTitle: 'Hidden Cove',
    media: PHOTO,
  })

  renderScreen(database)

  await waitFor(() => {
    expect(screen.getByText('Newer')).toBeTruthy()
  })
  expect(screen.getByText('Older')).toBeTruthy()
  expect(screen.getByText('📍 Hidden Cove')).toBeTruthy()

  jest.restoreAllMocks()
})

it('names a draft nobody has written a caption for', async () => {
  const database = createTestDatabase()
  await saveDraft(database, {
    caption: '',
    visibility: 'public',
    media: PHOTO,
  })

  renderScreen(database)

  await waitFor(() => {
    expect(screen.getByText('No caption yet')).toBeTruthy()
  })
})

it('reopens a draft in the compose screen', async () => {
  const database = createTestDatabase()
  const id = await saveDraft(database, {
    caption: 'Half a thought',
    visibility: 'private',
    media: PHOTO,
  })

  renderScreen(database)

  await waitFor(() => {
    expect(screen.getByText('Continue')).toBeTruthy()
  })
  fireEvent.press(screen.getByText('Continue'))

  expect(navigation.navigate).toHaveBeenCalledWith('PostCompose', {
    draftId: id,
  })
})

it('throws one away', async () => {
  const database = createTestDatabase()
  await saveDraft(database, {
    caption: 'Throwaway',
    visibility: 'private',
    media: PHOTO,
  })

  renderScreen(database)

  await waitFor(() => {
    expect(screen.getByText('Throwaway')).toBeTruthy()
  })
  await pressDeleteAndSettle(database, screen.getByLabelText('Delete draft: Throwaway'))

  expect(await database.get('post_drafts').query().fetchCount()).toBe(0)
  expect(screen.queryByText('Throwaway')).toBeNull()
  expect(screen.getByText('No drafts')).toBeTruthy()
})

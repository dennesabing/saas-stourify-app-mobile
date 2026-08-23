import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Database } from '@nozbe/watermelondb'
import DraftsScreen from '@/features/social/screens/DraftsScreen'
import { saveDraft } from '@/features/social/api/postDrafts'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

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
  fireEvent.press(screen.getByLabelText('Delete draft: Throwaway'))

  await waitFor(() => {
    expect(screen.queryByText('Throwaway')).toBeNull()
  })
  expect(await database.get('post_drafts').query().fetchCount()).toBe(0)
})

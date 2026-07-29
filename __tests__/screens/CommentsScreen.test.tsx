import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import CommentsScreen from '@/features/feed/screens/CommentsScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/comments', () => ({
  getComments: jest.fn(),
  createComment: jest.fn(),
}))

import { createComment, getComments } from '@/shared/api/comments'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function renderScreen(postId = 'post-1') {
  return render(
    <TestProviders database={createTestDatabase()}>
      <CommentsScreen navigation={navigation} route={{ params: { postId } } as any} />
    </TestProviders>,
  )
}

beforeEach(() => jest.clearAllMocks())

it('renders a thread — a top-level comment with its reply indented under it', async () => {
  ;(getComments as jest.Mock).mockResolvedValue({
    data: [
      { id: 'c1', body: 'Great shot!', user: { id: 'u1', name: 'Ana Martinez' }, parent_id: null, created_at: new Date().toISOString() },
      { id: 'c2', body: 'Agreed', user: { id: 'u2', name: 'Ben Cruz' }, parent_id: 'c1', created_at: new Date().toISOString() },
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 2 },
  })

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Great shot!')).toBeTruthy()
    expect(screen.getByText('Agreed')).toBeTruthy()
  })
})

it('shows an empty state when there are no comments', async () => {
  ;(getComments as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => expect(screen.getByText('No comments yet')).toBeTruthy())
})

it('appends the new comment optimistically when posting', async () => {
  ;(getComments as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  let resolveCreate!: (value: unknown) => void
  ;(createComment as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      resolveCreate = resolve
    }),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByText('No comments yet')).toBeTruthy())

  fireEvent.changeText(screen.getByPlaceholderText('Add a comment...'), 'Nice spot')
  fireEvent.press(screen.getByLabelText('Post comment'))

  // Appears immediately, before the network call resolves.
  await waitFor(() => expect(screen.getByText('Nice spot')).toBeTruthy())

  resolveCreate({ id: 'c3', body: 'Nice spot', user: { id: 'me', name: 'Me' }, parent_id: null, created_at: new Date().toISOString() })

  await waitFor(() => expect(createComment).toHaveBeenCalledWith('post-1', 'Nice spot'))
})

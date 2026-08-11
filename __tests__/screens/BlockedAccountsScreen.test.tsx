import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import BlockedAccountsScreen from '@/features/profile/screens/BlockedAccountsScreen'
import { ThemeProvider } from '@/theme/ThemeProvider'

/**
 * The Blocked accounts list (STOURIFY-37).
 *
 * This screen exists because the other-user profile cannot host Unblock: once a
 * block stands, `GET /profiles/{them}` answers 403 for the blocker too, so the
 * screen a "Block / Unblock" toggle would live on refuses to load. `GET /blocks`
 * is the only surface that can list them.
 *
 * The assertion that matters most is which uuid Unblock sends. `DELETE /blocks`
 * addresses the BLOCK row, and sending the user's uuid instead 404s — the same
 * class of bug STOURIFY-35 fixed on the unfollow path.
 */

jest.mock('@/shared/api/blocks', () => ({
  getBlocks: jest.fn(),
  unblockUser: jest.fn(),
}))

import { getBlocks, unblockUser } from '@/shared/api/blocks'

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function page(rows: unknown[]) {
  return { data: rows, links: {}, meta: { current_page: 1, last_page: 1, total: rows.length } }
}

function blockRow(over: Record<string, unknown> = {}) {
  return {
    uuid: 'block-1',
    blocked: {
      uuid: 'user-other',
      name: 'Grace Santos',
      username: 'santos_grace',
      bio: null,
      is_private: false,
    },
    created_at: null,
    ...over,
  }
}

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider scheme="light">
        <QueryClientProvider client={qc}>
          <BlockedAccountsScreen navigation={navigation} route={{ params: undefined } as any} />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(unblockUser as jest.Mock).mockResolvedValue(undefined)
})

test('the list names everyone I have blocked', async () => {
  ;(getBlocks as jest.Mock).mockResolvedValue(page([blockRow()]))

  renderScreen()

  expect(await screen.findByText('Grace Santos')).toBeTruthy()
  expect(screen.getByText('@santos_grace')).toBeTruthy()
})

test('blocking nobody reads as an empty list, not as a broken screen', async () => {
  ;(getBlocks as jest.Mock).mockResolvedValue(page([]))

  renderScreen()

  expect(await screen.findByText(/have not blocked anyone/i)).toBeTruthy()
})

test('Unblock addresses the block row uuid, never the user uuid', async () => {
  ;(getBlocks as jest.Mock).mockResolvedValue(page([blockRow()]))

  renderScreen()

  fireEvent.press(await screen.findByLabelText('Unblock Grace Santos'))

  await waitFor(() => expect(unblockUser).toHaveBeenCalledWith('block-1'))
  expect(unblockUser).not.toHaveBeenCalledWith('user-other')
})

test('a row whose explorer relation never loaded still renders instead of crashing', async () => {
  // `blocked` is a `whenLoaded` relation on the resource. The controller loads
  // it on every path today, but a row that arrives without it must not take the
  // screen down — the same defensive rule PostCard follows for its author.
  ;(getBlocks as jest.Mock).mockResolvedValue(page([blockRow({ blocked: undefined })]))

  renderScreen()

  expect(await screen.findByText(/unknown explorer/i)).toBeTruthy()
})

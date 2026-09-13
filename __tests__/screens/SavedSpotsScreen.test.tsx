import { AxiosError, type AxiosResponse } from 'axios'
import type { Database } from '@nozbe/watermelondb'
import { FlatList } from 'react-native'
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react-native'
import { onlineManager } from '@tanstack/react-query'
import SavedSpotsScreen from '@/features/spots/screens/SavedSpotsScreen'
import type WishlistItem from '@/db/models/WishlistItem'
import { getWishlist } from '@/shared/api/wishlist'
import { createTestDatabase, markSynced, seedSpot } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/wishlist', () => ({
  WISHLIST_QUERY_KEY: ['wishlist'],
  getWishlist: jest.fn(),
}))

const mockGetWishlist = getWishlist as jest.MockedFunction<typeof getWishlist>
const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function renderScreen(database: Database = createTestDatabase()) {
  return render(
    <TestProviders database={database}>
      <SavedSpotsScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )
}

function savedItem(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'wish-1',
    note: null,
    is_downloaded_offline: false,
    created_at: '2026-08-20T00:00:00+00:00',
    spot: {
      uuid: 'spot-1',
      title: 'Blue Cove',
      categories: ['Coast'],
      address: 'Sarangani',
      rating_average: 4.5,
      reviews_count: 12,
      media: [{ thumb_url: 'https://cdn.example/thumb.jpg' }],
    },
    ...overrides,
  } as any
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('lists the spots the explorer has saved', async () => {
  mockGetWishlist.mockResolvedValue([savedItem()])
  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Blue Cove')).toBeTruthy()
  })
})

it('opens the spot when a saved row is pressed', async () => {
  mockGetWishlist.mockResolvedValue([savedItem()])
  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('Blue Cove'))

  expect(navigation.navigate).toHaveBeenCalledWith('SpotDetail', { spotId: 'spot-1' })
})

it('invites the explorer to save something when they have saved nothing', async () => {
  mockGetWishlist.mockResolvedValue([])
  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Nothing saved yet')).toBeTruthy()
  })
})

/**
 * The distinction this screen exists to keep straight. Telling someone "nothing
 * saved yet" when the request actually failed is a claim about THEIR data made
 * from a network error — and the reader's reasonable conclusion is that their
 * saves were lost.
 */
it('says the request failed rather than claiming nothing is saved', async () => {
  mockGetWishlist.mockRejectedValue(new Error('offline'))
  renderScreen()

  await waitFor(() => {
    expect(screen.getByText("Couldn't load your saved spots")).toBeTruthy()
  })

  expect(screen.queryByText('Nothing saved yet')).toBeNull()
  expect(screen.getByText('Try again')).toBeTruthy()
})

/**
 * STOURIFY-280, following STOURIFY-225 and -250. This panel was headed "Can't
 * reach Stourify" over "…try again once you have signal" for every failure,
 * including a refusal the server answered — so, as on Discover, the headline was
 * part of the wrong claim, and the refusal test forbids any wording about
 * reaching, connection or signal. The pair is the point: the first test alone
 * would pass if the connection wording were deleted everywhere, which would
 * break the one case where it is true.
 */
describe('the failure it reports is the failure that happened', () => {
  function forbidden() {
    const config = { headers: {} } as never
    return new AxiosError('Request failed with status code 403', '403', config, {}, {
      status: 403,
      statusText: 'Forbidden',
      data: { message: 'This action is unauthorized.' },
      headers: {},
      config,
    } as AxiosResponse)
  }

  it('does not blame the connection at all when the server answered 403', async () => {
    mockGetWishlist.mockRejectedValue(forbidden())
    renderScreen()

    await waitFor(() => {
      expect(screen.getByText("Couldn't load your saved spots")).toBeTruthy()
    })
    expect(screen.queryByText(/can't reach|connection|signal/i)).toBeNull()
    expect(screen.getByText(/isn't allowed/i)).toBeTruthy()
  })

  it('still blames the connection when there really was no answer', async () => {
    mockGetWishlist.mockRejectedValue(
      new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never, {}),
    )
    renderScreen()

    await waitFor(() => {
      expect(screen.getByText("Couldn't load your saved spots")).toBeTruthy()
    })
    expect(screen.getByText(/check your connection/i)).toBeTruthy()
  })
})

/**
 * A saved row whose spot is gone still occupies a line. Dropping it silently
 * would shorten the list with no explanation, which reads as a save having
 * vanished.
 */
it('keeps a row for a saved spot that no longer exists', async () => {
  mockGetWishlist.mockResolvedValue([savedItem({ spot: undefined })])
  renderScreen()

  await waitFor(() => {
    expect(screen.getByTestId('saved-spot-missing')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Artboard 3 of the Profile design (STOURIFY-289)
// ---------------------------------------------------------------------------

describe('the Wishlist layout', () => {
  it('has a round-back header titled "Wishlist"', async () => {
    mockGetWishlist.mockResolvedValue([savedItem()])

    renderScreen()

    expect(await screen.findByText('Wishlist')).toBeTruthy()
    fireEvent.press(screen.getByLabelText(/back/i))
    expect(navigation.goBack).toHaveBeenCalled()
  })

  it('draws a row as a photo, a category pill, the title and the address', async () => {
    mockGetWishlist.mockResolvedValue([savedItem()])

    renderScreen()

    expect(await screen.findByText('Blue Cove')).toBeTruthy()
    expect(screen.getByText('Coast')).toBeTruthy()
    expect(screen.getByText('Sarangani')).toBeTruthy()
    expect(screen.getByTestId('saved-spot-photo')).toBeTruthy()
  })

  it('still draws a row with no photo and no category, without a broken tile', async () => {
    mockGetWishlist.mockResolvedValue([
      savedItem({
        spot: { uuid: 'spot-2', title: 'Quiet Pier', categories: [], address: null, media: [] },
      }),
    ])

    renderScreen()

    expect(await screen.findByText('Quiet Pier')).toBeTruthy()
    expect(screen.queryByTestId('saved-spot-photo')).toBeNull()
    expect(screen.getByTestId('saved-spot-photo-empty')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// A save still on the phone (STOURIFY-207)
// ---------------------------------------------------------------------------

/**
 * Saving is a local write that the sync sends later, and this screen reads the
 * server. For the couple of minutes in between, the save existed only where
 * this screen did not look: it said "Nothing saved yet" while the spot page
 * showed the save with its queued mark. These tests seed the phone's own row —
 * the thing the old tests never had, because they mocked the server and so had
 * no drain to be early for.
 */
describe('a save the phone has not sent yet', () => {
  /** What the spot page keeps on the save when you tap it (STOURIFY-207). */
  const HIDDEN_FALLS = {
    uuid: 'spot-9',
    title: 'Hidden Falls',
    categories: ['Nature'],
    address: "Lake Sebu, T'boli",
    thumb_url: 'https://cdn.example/falls-thumb.jpg',
  }

  async function seedSave(
    database: Database,
    spotUuid: string,
    snapshot: Record<string, unknown> | null,
  ): Promise<WishlistItem> {
    return database.write(async () =>
      database.get<WishlistItem>('sto_wishlist_items').create((row: any) => {
        row._raw.id = `local-${spotUuid}`
        row._raw.uuid = `local-${spotUuid}`
        row._raw.spot_id = null
        row._raw.spot_uuid = spotUuid
        row._raw.note = null
        row._raw.is_downloaded_offline = false
        row._raw.spot_snapshot = snapshot === null ? null : JSON.stringify(snapshot)
        row._raw.created_at = 1_757_000_000_000
        row._raw.updated_at = 1_757_000_000_000
      }),
    )
  }

  /** The server's copy of the same save, once it has arrived there. */
  function serverCopy() {
    return savedItem({
      uuid: 'local-spot-9',
      spot: {
        uuid: 'spot-9',
        title: 'Hidden Falls',
        categories: ['Nature'],
        address: "Lake Sebu, T'boli",
        media: [{ thumb_url: 'https://cdn.example/falls-thumb.jpg' }],
      },
    })
  }

  it('lists it by name, marked queued, and does not say nothing is saved', async () => {
    const database = createTestDatabase()
    await seedSave(database, 'spot-9', HIDDEN_FALLS)
    mockGetWishlist.mockResolvedValue([])

    renderScreen(database)

    expect(await screen.findByText('Hidden Falls')).toBeTruthy()
    expect(screen.getByText('Nature')).toBeTruthy()
    expect(screen.getByText("Lake Sebu, T'boli")).toBeTruthy()
    expect(screen.getByTestId('saved-spot-queued')).toBeTruthy()
    expect(screen.getByText('Queued ↑')).toBeTruthy()
    expect(screen.queryByText('Nothing saved yet')).toBeNull()
  })

  it('opens the spot from the queued row, like any other', async () => {
    const database = createTestDatabase()
    await seedSave(database, 'spot-9', HIDDEN_FALLS)
    mockGetWishlist.mockResolvedValue([])

    renderScreen(database)

    fireEvent.press(await screen.findByLabelText('Hidden Falls'))
    expect(navigation.navigate).toHaveBeenCalledWith('SpotDetail', { spotId: 'spot-9' })
  })

  it('draws it above the saves the server already has', async () => {
    const database = createTestDatabase()
    await seedSave(database, 'spot-9', HIDDEN_FALLS)
    mockGetWishlist.mockResolvedValue([savedItem()])

    renderScreen(database)

    await screen.findByText('Hidden Falls')
    const titles = screen.getAllByRole('button').map((row) => row.props.accessibilityLabel)
    expect(titles.indexOf('Hidden Falls')).toBeLessThan(titles.indexOf('Blue Cove'))
  })

  it('shows it once when the server has it too', async () => {
    const database = createTestDatabase()
    await seedSave(database, 'spot-9', HIDDEN_FALLS)
    mockGetWishlist.mockResolvedValue([serverCopy()])

    renderScreen(database)

    await screen.findByText('Hidden Falls')
    expect(screen.getAllByText('Hidden Falls')).toHaveLength(1)
  })

  it('asks the server again once it has sent, and then shows it once, no longer queued', async () => {
    const database = createTestDatabase()
    const save = await seedSave(database, 'spot-9', HIDDEN_FALLS)
    mockGetWishlist.mockResolvedValue([])

    renderScreen(database)
    expect(await screen.findByText('Queued ↑')).toBeTruthy()
    expect(mockGetWishlist).toHaveBeenCalledTimes(1)

    // The sync sends it: the server now has it, and the phone's row is marked sent.
    mockGetWishlist.mockResolvedValue([serverCopy()])
    await act(() => markSynced(database, save))

    await waitFor(() => expect(mockGetWishlist).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('Queued ↑')).toBeNull())
    expect(screen.getAllByText('Hidden Falls')).toHaveLength(1)
    expect(screen.queryByText('Nothing saved yet')).toBeNull()
  })

  /**
   * Between "sent" and "the server's list has been fetched again" there is a
   * gap. Dropping the row in that gap would make it blink out and back — the
   * very disappearance this card is about, shortened.
   */
  it('stays listed between sending and the server list catching up', async () => {
    const database = createTestDatabase()
    const save = await seedSave(database, 'spot-9', HIDDEN_FALLS)
    mockGetWishlist.mockResolvedValue([])

    renderScreen(database)
    expect(await screen.findByText('Queued ↑')).toBeTruthy()

    let answer: (items: any[]) => void = () => {}
    mockGetWishlist.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    await act(() => markSynced(database, save))

    await waitFor(() => expect(screen.queryByText('Queued ↑')).toBeNull())
    expect(screen.getByText('Hidden Falls')).toBeTruthy()
    expect(screen.queryByText('Nothing saved yet')).toBeNull()

    await act(async () => answer([serverCopy()]))
    expect(screen.getAllByText('Hidden Falls')).toHaveLength(1)
  })

  it("borrows the phone's own spot row when the save carries no copy", async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-mine', title: 'My Secret Pier' })
    await seedSave(database, 'spot-mine', null)
    mockGetWishlist.mockResolvedValue([])

    renderScreen(database)

    expect(await screen.findByText('My Secret Pier')).toBeTruthy()
    expect(screen.getByTestId('saved-spot-queued')).toBeTruthy()
  })

  /**
   * A save made before this change, of somebody else's spot: nothing on the
   * phone can name it. It still gets a line, and the line says why it is
   * plain, rather than borrowing the "no longer available" wording, which
   * would be false.
   */
  it('shows a plain placeholder when nothing on the phone can name the spot', async () => {
    const database = createTestDatabase()
    await seedSave(database, 'spot-unknown', null)
    mockGetWishlist.mockResolvedValue([])

    renderScreen(database)

    expect(await screen.findByTestId('saved-spot-pending')).toBeTruthy()
    expect(screen.getByText(/details appear once it sends/i)).toBeTruthy()
    expect(screen.getByTestId('saved-spot-queued')).toBeTruthy()
    expect(screen.queryByTestId('saved-spot-missing')).toBeNull()
    expect(screen.queryByText('Nothing saved yet')).toBeNull()
  })

  it('lists it under a notice when the rest could not be loaded', async () => {
    const database = createTestDatabase()
    await seedSave(database, 'spot-9', HIDDEN_FALLS)
    mockGetWishlist.mockRejectedValue(new Error('offline'))

    renderScreen(database)

    expect(await screen.findByText("Couldn't load the rest of your saved spots")).toBeTruthy()
    expect(screen.getByText('Hidden Falls')).toBeTruthy()
    expect(screen.getByText('Try again')).toBeTruthy()
    expect(screen.queryByText('Nothing saved yet')).toBeNull()

    mockGetWishlist.mockResolvedValue([serverCopy(), savedItem()])
    fireEvent.press(screen.getByText('Try again'))

    expect(await screen.findByText('Blue Cove')).toBeTruthy()
    expect(screen.queryByText("Couldn't load the rest of your saved spots")).toBeNull()
  })

  /**
   * With no signal and no list read before, the request is not failing — it is
   * waiting for a connection, and would wait forever. Saying "loading" there
   * would be a promise the screen cannot keep.
   */
  it('says the rest will load once back online, when the phone is offline', async () => {
    const database = createTestDatabase()
    await seedSave(database, 'spot-9', HIDDEN_FALLS)
    mockGetWishlist.mockResolvedValue([])
    onlineManager.setOnline(false)

    try {
      renderScreen(database)

      expect(await screen.findByText('Hidden Falls')).toBeTruthy()
      expect(
        screen.getByText(/rest of your saved spots will load when you're back online/i),
      ).toBeTruthy()
      expect(mockGetWishlist).not.toHaveBeenCalled()
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('still says nothing is saved when nothing is saved and nothing is waiting', async () => {
    const database = createTestDatabase()
    const sent = await seedSave(database, 'spot-gone', null)
    // A row the phone has already sent and that carries no copy is the
    // server's to report, and the server says the list is empty.
    await markSynced(database, sent)
    mockGetWishlist.mockResolvedValue([])

    renderScreen(database)

    expect(await screen.findByText('Nothing saved yet')).toBeTruthy()
    expect(screen.queryByTestId('saved-spot-queued')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Removing a save from the list (STOURIFY-303)
// ---------------------------------------------------------------------------

/**
 * Artboard 3 draws a filled bookmark at the right end of every row, and
 * tapping it takes the spot off the list. The server hears about it on the next
 * sync, so these tests also pin what the list does in between: the save must
 * stay gone even if the server's list is fetched again before it has heard.
 */
describe('removing a save from the list', () => {
  async function seedRow(
    database: Database,
    {
      id,
      spotUuid,
      sent,
      snapshot = null,
    }: {
      id: string
      spotUuid: string
      sent: boolean
      snapshot?: Record<string, unknown> | null
    },
  ): Promise<void> {
    const row = await database.write(async () =>
      database.get<WishlistItem>('sto_wishlist_items').create((r: any) => {
        r._raw.id = id
        r._raw.uuid = id
        r._raw.spot_id = null
        r._raw.spot_uuid = spotUuid
        r._raw.note = null
        r._raw.is_downloaded_offline = false
        r._raw.spot_snapshot = snapshot === null ? null : JSON.stringify(snapshot)
        r._raw.created_at = 1_757_000_000_000
        r._raw.updated_at = 1_757_000_000_000
      }),
    )
    if (sent) await markSynced(database, row)
  }

  it('removes a save at once, without opening the spot', async () => {
    const database = createTestDatabase()
    await seedRow(database, { id: 'wish-1', spotUuid: 'spot-1', sent: true })
    mockGetWishlist.mockResolvedValue([savedItem()])

    renderScreen(database)
    fireEvent.press(await screen.findByLabelText('Remove Blue Cove from your wishlist'))

    await waitFor(() => expect(screen.queryByText('Blue Cove')).toBeNull())
    expect(navigation.navigate).not.toHaveBeenCalled()
    expect(await database.adapter.getDeletedRecords('sto_wishlist_items')).toEqual(['wish-1'])
  })

  it('stays gone when the list is refreshed before the removal has been sent', async () => {
    const database = createTestDatabase()
    await seedRow(database, { id: 'wish-1', spotUuid: 'spot-1', sent: true })
    mockGetWishlist.mockResolvedValue([savedItem()])

    renderScreen(database)
    fireEvent.press(await screen.findByLabelText('Remove Blue Cove from your wishlist'))
    await waitFor(() => expect(screen.queryByText('Blue Cove')).toBeNull())

    // The server has not heard yet, so it still lists the save.
    await act(async () => {
      fireEvent(screen.UNSAFE_getByType(FlatList), 'refresh')
    })

    await waitFor(() => expect(mockGetWishlist).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Blue Cove')).toBeNull()
  })

  it('removes a save the phone had not sent yet, leaving nothing to send', async () => {
    const database = createTestDatabase()
    await seedRow(database, {
      id: 'local-spot-9',
      spotUuid: 'spot-9',
      sent: false,
      snapshot: {
        uuid: 'spot-9',
        title: 'Hidden Falls',
        categories: ['Nature'],
        address: null,
        thumb_url: null,
      },
    })
    mockGetWishlist.mockResolvedValue([])

    renderScreen(database)
    fireEvent.press(await screen.findByLabelText('Remove Hidden Falls from your wishlist'))

    expect(await screen.findByText('Nothing saved yet')).toBeTruthy()
    expect(await database.get('sto_wishlist_items').query().fetchCount()).toBe(0)
    expect(await database.adapter.getDeletedRecords('sto_wishlist_items')).toEqual([])
  })

  it('removes a save the phone never pulled down, by leaving a removal marker', async () => {
    const database = createTestDatabase()
    mockGetWishlist.mockResolvedValue([savedItem()])

    renderScreen(database)
    fireEvent.press(await screen.findByLabelText('Remove Blue Cove from your wishlist'))

    await waitFor(() => expect(screen.queryByText('Blue Cove')).toBeNull())
    expect(await database.adapter.getDeletedRecords('sto_wishlist_items')).toEqual(['wish-1'])
  })

  it('can remove a save whose spot no longer exists', async () => {
    const database = createTestDatabase()
    mockGetWishlist.mockResolvedValue([savedItem({ spot: undefined })])

    renderScreen(database)
    fireEvent.press(await screen.findByLabelText('Remove this saved spot from your wishlist'))

    await waitFor(() => expect(screen.queryByTestId('saved-spot-missing')).toBeNull())
  })
})

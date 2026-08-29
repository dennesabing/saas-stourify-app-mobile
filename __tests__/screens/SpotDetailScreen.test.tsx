import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { QueryClient } from '@tanstack/react-query'
import SpotDetailScreen from '@/features/spots/screens/SpotDetailScreen'
import type WishlistItem from '@/db/models/WishlistItem'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/spots', () => ({
  getSpot: jest.fn(),
  getSpotPosts: jest.fn(),
}))

jest.mock('@/shared/api/spotAbouts', () => ({
  getSpotAbouts: jest.fn(),
  createSpotAbout: jest.fn(),
}))

jest.mock('@/shared/api/reactions', () => ({
  addReaction: jest.fn(),
  removeReaction: jest.fn(),
}))

import { getSpot, getSpotPosts } from '@/shared/api/spots'
import { createSpotAbout, getSpotAbouts } from '@/shared/api/spotAbouts'
import { addReaction, removeReaction } from '@/shared/api/reactions'
import { trackQueryClient } from '../support/queryClients'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function makeSpot(overrides: Partial<any> = {}) {
  return {
    id: 's1',
    uuid: 'spot-1',
    title: 'Blue Cove',
    slug: 'blue-cove',
    description: 'A quiet cove.',
    latitude: 6.1,
    longitude: 125.2,
    address: 'Coastal Road',
    status: 'published',
    // Deliberately false by default. A moderator has to vouch for a spot before
    // it is verified, so an ordinary spot is not — and a fixture that defaults
    // to true would let any test in this file pass on a badge it never asked
    // for. The two tests that are about the badge set it explicitly.
    is_verified: false,
    categories: ['Nature', 'Viewpoint'],
    media: [
      { uuid: 'm1', url: 'https://cdn.test/photo1.jpg', thumb_url: null },
      { uuid: 'm2', url: 'https://cdn.test/photo2.jpg', thumb_url: null },
    ],
    rating_average: 4.5,
    reviews_count: 12,
    saves_count: 3,
    ...overrides,
  }
}

function renderScreen(
  database = createTestDatabase(),
  spotId = 'spot-1',
  queryClient?: QueryClient,
) {
  return render(
    <TestProviders database={database} queryClient={queryClient}>
      <SpotDetailScreen navigation={navigation} route={{ params: { spotId } } as any} />
    </TestProviders>,
  )
}

/**
 * One About entry, with every field the server actually sends. Overrides let a
 * test change one fact without restating the other nine.
 */
function makeAbout(overrides: Partial<any> = {}) {
  return {
    uuid: 'about-1',
    body: 'Go at sunrise, the light is worth it.',
    spot_uuid: 'spot-1',
    author: { uuid: 'u1', name: 'Mila Reyes', username: 'mila', avatar_url: null },
    likes_count: 5,
    comments_count: 2,
    is_liked: false,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    can: {},
    ...overrides,
  }
}

function aboutPage(entries: any[]) {
  return {
    data: entries,
    links: {},
    meta: { current_page: 1, last_page: 1, total: entries.length },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  // Every test opening the About tab needs this to resolve. A test that cares
  // about the list overrides it; the rest would otherwise fail on a screen they
  // are not about.
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(aboutPage([]))
})

it('renders a real hero image, the rating and the review count', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => {
    expect(screen.getAllByTestId('spot-hero-image').length).toBeGreaterThan(0)
    expect(screen.getByText('Blue Cove')).toBeTruthy()
    expect(screen.getByText('4.5')).toBeTruthy()
    // "See all reviews" is now the rating row's accessible name rather than a
    // button label (STOURIFY-197) — it is a way through, not a second control.
    expect(screen.getByLabelText('See all reviews')).toBeTruthy()
  })

  // The loading placeholder must go once the answer is in. A skeleton left
  // mounted under real content is invisible in a screenshot and permanent in a
  // screen reader, which announces "Loading" over a spot that has finished.
  expect(screen.queryByTestId('spot-hero-loading')).toBeNull()
  expect(screen.queryByText('No photos yet')).toBeNull()
  expect(screen.queryByTestId('spot-hero-error')).toBeNull()
})

// A "Verified" badge is a shop's health-inspection certificate in the window:
// it means somebody with authority came and checked. Only a moderator can put
// it there — `is_verified` cannot be set by the spot's own author, on the API
// or through the offline push — so the two states below are the only two a
// reader can ever see, and the badge has to tell them apart.
//
// It did not. Until STOURIFY-72 the screen asked `status === 'active'`, and
// `active` is not one of the four values the server's SpotStatus enum can send,
// so the badge never appeared on any spot on any device. The test that was
// here asserted it DID appear and passed — against a fixture writing the same
// impossible value. A green test proving a badge works, on a wire shape that
// does not exist. These two ask the field the server actually sends.
it('shows the verified badge on a spot a moderator has verified', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ is_verified: true }))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByText('✓ Verified')).toBeTruthy())
})

it('shows no verified badge on a spot nobody has verified', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ is_verified: false }))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  // Wait for the spot itself to arrive first. Asserting the badge's absence on
  // an empty screen would pass before the request had even resolved, which is
  // the same as asserting nothing at all.
  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  expect(screen.queryByText('✓ Verified')).toBeNull()
})

it('shows a loading hero, and says nothing about photos, while the spot request is still in flight', async () => {
  // A promise that never settles is the whole point: it holds the screen in the
  // state a slow network puts it in, for as long as the test looks at it.
  ;(getSpot as jest.Mock).mockReturnValue(new Promise(() => {}))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('spot-hero-loading')).toBeTruthy())

  // The two absences are the actual bug. "No photos yet" is a claim about a spot
  // nobody has heard back about yet, and asserting only that the placeholder
  // appeared would pass against a hero that rendered both of them stacked.
  expect(screen.queryByText('No photos yet')).toBeNull()
  expect(screen.queryByTestId('spot-hero-image')).toBeNull()

  // Nothing has loaded, so there is no gallery to open.
  fireEvent.press(screen.getByTestId('spot-hero'))
  expect(navigation.navigate).not.toHaveBeenCalled()

  // Still asking is not the same as asked and failed. The failure copy belongs
  // to a request that came back broken, and this one has not come back at all.
  expect(screen.queryByText("Couldn't load this spot")).toBeNull()
})

it('says the request failed, and offers a retry, when the spot cannot be fetched', async () => {
  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('spot-hero-error')).toBeTruthy())
  expect(screen.getByText("Couldn't load this spot")).toBeTruthy()
  expect(screen.getByText('Try again')).toBeTruthy()

  // The three absences are what make this a fix rather than a fourth thing on
  // screen. Each names one of the states this one must not be confused with:
  // still waiting, loaded with photos, loaded with none.
  expect(screen.queryByTestId('spot-hero-loading')).toBeNull()
  expect(screen.queryByTestId('spot-hero-image')).toBeNull()
  expect(screen.queryByText('No photos yet')).toBeNull()

  // And nothing anywhere on the screen is still pulsing. `Skeleton` renders
  // with the accessibility label "Loading", so a screen reader would otherwise
  // keep announcing a request that finished — badly — some time ago. This is
  // the rating, which asked the same stuck question the hero did.
  expect(screen.queryAllByLabelText('Loading')).toHaveLength(0)
})

it('shows no spot facts and no spot actions when the spot cannot be fetched', async () => {
  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [
      {
        uuid: 'post-1',
        caption: 'x',
        visibility: 'public',
        is_published: true,
        published_at: null,
        likes_count: 0,
        comments_count: 0,
        created_at: '',
        updated_at: '',
        can: {},
      },
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('spot-hero-error')).toBeTruthy())

  // Everything in the details block is a fact about the spot or an action on
  // it, and there is no spot. `...` and "See all reviews" are the two the
  // card is named after; the rest come from the same block and would otherwise
  // sit under the error panel inviting the reader to review and bookmark a
  // place the app has just admitted it cannot identify.
  expect(screen.queryByText('...')).toBeNull()
  expect(screen.queryByText('See all reviews')).toBeNull()
  expect(screen.queryByText('Write a review')).toBeNull()
  expect(screen.queryByText('Save')).toBeNull()
  expect(screen.queryByText('✓ Verified')).toBeNull()

  // …and the presences are what keep this from quietly becoming the
  // whole-screen error panel that STOURIFY-64 rejected. The posts came from a
  // second, independent request that succeeded, so they stay.
  expect(screen.getByText('Posts')).toBeTruthy()
  expect(screen.getByText('About')).toBeTruthy()
})

it('renders no coordinates line on the About tab when the spot failed to load', async () => {
  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('spot-hero-error')).toBeTruthy())

  // The About tab is not mounted until it is selected, so this cannot be
  // folded into the case above: an assertion made on the Posts tab proves
  // nothing about a subtree that does not exist yet.
  fireEvent.press(screen.getByText('About'))

  // The line is asserted by its testID, not by the string it prints, and that
  // is deliberate. STOURIFY-65 was filed saying this renders
  // "undefined, undefined"; it does not. React drops an `undefined` child
  // entirely, so what actually reaches the screen is the literal comma and
  // space left between the two absent numbers — an orphan `, ` under the
  // address. Asserting the absent string would have passed against the bug.
  expect(screen.queryByTestId('spot-coordinates')).toBeNull()
  expect(screen.queryByText(', ')).toBeNull()
})

it('renders no coordinates line at all for a spot that has none', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ latitude: null, longitude: null }))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  // The second reader of the same bug, and the one nobody filed: a spot that
  // loaded perfectly well but carries no coordinates printed the same orphan
  // comma. Optional chaining stops `.toFixed()` throwing on an absent number;
  // it does not stop the rest of the line being drawn.
  await waitFor(() => expect(screen.getByText('A quiet cove.')).toBeTruthy())

  // The address survives without a coordinate -- a spot whose contributor hid
  // its location is exactly this state (STOURIFY-185), and losing the address
  // too would be a second, unasked-for withdrawal.
  expect(screen.getByTestId('spot-location-static')).toBeTruthy()
  expect(screen.getByText('Coastal Road')).toBeTruthy()

  // And nothing pretends to be openable when there is nothing to open.
  expect(screen.queryByTestId('spot-location')).toBeNull()
  expect(screen.queryByTestId('spot-coordinates')).toBeNull()
  expect(screen.queryByText(', ')).toBeNull()
})

it('renders the coordinates of a spot on the equator, which are real coordinates', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ latitude: 0, longitude: 0 }))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  // The equator and the prime meridian are places, not missing data. This is
  // the case a `spot?.latitude && …` guard would silently swallow, which is
  // why the guard is written with `typeof`.
  await waitFor(() => expect(screen.getByTestId('spot-coordinates')).toBeTruthy())
  expect(screen.getByText('0.0000, 0.0000')).toBeTruthy()
})

it('re-runs the spot request when Try again is pressed', async () => {
  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())
  expect(getSpot).toHaveBeenCalledTimes(1)

  fireEvent.press(screen.getByText('Try again'))

  // Copy without a working button is a nicer dead end, not a way out.
  await waitFor(() => expect((getSpot as jest.Mock).mock.calls.length).toBeGreaterThan(1))
})

it('keeps showing a spot it already has while the refetch is failing', async () => {
  // The offline case, and the reason the failure branch is gated on `!spot`
  // rather than on `isError` alone. Yesterday's spot is in the persisted cache,
  // today's network is gone: the reader should read the spot, not an apology
  // for not having one.
  const queryClient = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )
  queryClient.setQueryData(['spot', 'spot-1'], makeSpot())

  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen(createTestDatabase(), 'spot-1', queryClient)

  await waitFor(() => expect(getSpot).toHaveBeenCalled())

  expect(screen.getAllByTestId('spot-hero-image').length).toBeGreaterThan(0)
  expect(screen.getByText('Blue Cove')).toBeTruthy()
  expect(screen.queryByTestId('spot-hero-error')).toBeNull()
  expect(screen.queryByText("Couldn't load this spot")).toBeNull()

  // The whole details block stays too, not just the hero and the title. A
  // failed-state rule that hid the reviews link here would be taking a real
  // number off the screen because a background request went wrong.
  expect(screen.getByLabelText('See all reviews')).toBeTruthy()
  expect(screen.getByTestId('spot-save')).toBeTruthy()
})

it('renders a design-system placeholder hero when the spot has no photos, never a bare grey box', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ media: [] }))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => {
    expect(screen.queryByTestId('spot-hero-image')).toBeNull()
    expect(screen.getByText('No photos yet')).toBeTruthy()
  })

  // …and only once the request has come back. The sentence is true here and was
  // false a moment ago; this pins the difference so the two states cannot
  // collapse back into one branch.
  expect(screen.queryByTestId('spot-hero-loading')).toBeNull()

  // …and the request succeeded, so nothing may suggest it did not.
  expect(screen.queryByTestId('spot-hero-error')).toBeNull()

  // A hero with no photos has no gallery to open, so tapping it must do nothing.
  // The screen enforces that with `disabled` on the hero Pressable; this pins the
  // behaviour so a refactor cannot drop it silently.
  fireEvent.press(screen.getByTestId('spot-hero'))
  expect(navigation.navigate).not.toHaveBeenCalled()
})

it('opens the gallery when the hero is tapped', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  // Wait for the hero PHOTO, not merely for the hero button. The button is on
  // screen from the first frame, but it is disabled until the spot's photos
  // arrive (`disabled={media.length === 0}`) — and React Native applies that
  // disabled flag to the underlying touch handler in an effect, one flush after
  // the element already renders as enabled. Waiting for `spot-hero` therefore
  // returns during the loading state and the press races that flush: green on an
  // idle machine, dropped under load (STOURIFY-62). `spot-hero-image` exists only
  // on the has-photos branch, so waiting for it waits for the actual precondition.
  await waitFor(() => expect(screen.getAllByTestId('spot-hero-image').length).toBeGreaterThan(0))
  fireEvent.press(screen.getByTestId('spot-hero'))

  expect(navigation.navigate).toHaveBeenCalledWith('PhotoGallery', { spotId: 'spot-1' })
})

it('navigates to the reviews list', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  // The rating row IS the way to the reviews now. Pressing the row rather than
  // a button below it is the whole of direction A's saving here (STOURIFY-197).
  await waitFor(() => expect(screen.getByLabelText('See all reviews')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('See all reviews'))
  expect(navigation.navigate).toHaveBeenCalledWith('Reviews', { spotId: 'spot-1' })
})

/**
 * Save moved onto the photo (STOURIFY-197, direction A).
 *
 * It sat beside the rating before that, which was itself a fix — it used to
 * have a full row of its own while the rating line beside it was mostly empty
 * space (STOURIFY-102). Direction A takes the next step: the page had four
 * controls stacked above any content, and the rating line is more useful as a
 * way through to the reviews than as a shelf for a button.
 *
 * **It must not be nested inside the hero.** The hero is itself a button that
 * opens the gallery, and a touch target inside another touch target is an
 * arrangement that works until a platform decides otherwise.
 */
it('puts Save on the photo, outside the hero button, and not in the rating row', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('spot-save')).toBeTruthy())

  // Named for what it does, since the mark alone does not say it.
  expect(screen.getByLabelText('Save this spot')).toBeTruthy()

  // Not a child of the hero — the nesting rule above.
  expect(within(screen.getByTestId('spot-hero')).queryByTestId('spot-save')).toBeNull()

  // And the rating row is now purely the route to the reviews.
  const row = within(screen.getByTestId('spot-rating-row'))
  expect(row.getByText('4.5')).toBeTruthy()
  expect(row.queryByTestId('spot-save')).toBeNull()
})

/**
 * STOURIFY-197 took this page from two review buttons to one. STOURIFY-211
 * takes it to none: the survivor, "Write a review", moved to the reviews page
 * itself — the comment cards now live next to the guest book rather than by the
 * front door.
 *
 * No capability was lost. The rating row still leads to the reviews, and the
 * button is the first thing on the page it leads to.
 */
it('offers no review buttons at all — both moved or merged into the rating row', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByLabelText('See all reviews')).toBeTruthy())

  // Both gone as LABELS. Asserting on the text rather than the accessible name
  // is deliberate for the first one: that name still exists, on the rating row.
  expect(screen.queryByText('See all reviews')).toBeNull()
  expect(screen.queryByText('Write a review')).toBeNull()
})

it('saves to the wishlist as a local write, never touching the network', async () => {
  const database = createTestDatabase()
  const fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch

  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen(database)

  await waitFor(() => expect(screen.getByTestId('spot-save')).toBeTruthy())
  fireEvent.press(screen.getByTestId('spot-save'))

  await waitFor(async () => {
    expect(await database.get<WishlistItem>('sto_wishlist_items').query().fetchCount()).toBe(1)
  })

  expect(fetchSpy).not.toHaveBeenCalled()

  // The queued state is readable on the mark itself, so a save made offline
  // does not look identical to one that has already gone.
  await waitFor(() => {
    expect(screen.getByText('🔖 ↑')).toBeTruthy()
  })

  const [item] = await database.get<WishlistItem>('sto_wishlist_items').query().fetch()
  expect(item.spotUuid).toBe('spot-1')
  expect(item.isQueued).toBe(true)
})

it('preserves the Posts and About tabs', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [
      {
        uuid: 'post-1',
        caption: 'x',
        visibility: 'public',
        is_published: true,
        published_at: null,
        likes_count: 0,
        comments_count: 0,
        created_at: '',
        updated_at: '',
        can: {},
      },
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Posts')).toBeTruthy())
  expect(screen.getByText('About')).toBeTruthy()

  fireEvent.press(screen.getByText('About'))
  await waitFor(() => expect(screen.getByText('A quiet cove.')).toBeTruthy())

  // A spot that loaded shows its coordinates exactly as it always has. The
  // guard added for the failed state must not cost the working state anything.
  expect(screen.getByText('6.1000, 125.2000')).toBeTruthy()
})

/* ------------------------------------------------------------------------
 * The About tab — the spot's own description (STOURIFY-213)
 * ---------------------------------------------------------------------- */

/**
 * The description is the one piece of text on this tab written by whoever added
 * the spot; everything below it was pinned up by other visitors. It was drawn as
 * bare text with nothing around it, so a reader had no way to tell those two
 * things apart -- the museum label without its brass plate.
 *
 * These two cases are deliberately a pair. The first proves the box is there
 * when there is something to put in it; the second proves it is NOT there when
 * there is not, because wrapping the ternary rather than its result gives every
 * description-less spot an empty bordered rectangle -- a label with nothing on
 * it, which is worse than the bug being fixed.
 */
it('wraps the description in its own surface so it reads as the words of whoever added the spot', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getByTestId('spot-description')).toBeTruthy())

  // The text still renders, and it renders INSIDE the surface rather than
  // beside it. A box that does not contain the description would satisfy a
  // bare getByTestId and fix nothing.
  expect(within(screen.getByTestId('spot-description')).getByText('A quiet cove.')).toBeTruthy()
})

it('renders no surface at all for a spot that has no description', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ description: null }))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  // The tab itself still works -- this asserts an absence, and an absence is
  // also what a screen that failed to render would show. The address proves
  // the tab is genuinely mounted.
  await waitFor(() => expect(screen.getByText('Coastal Road')).toBeTruthy())
  expect(screen.queryByTestId('spot-description')).toBeNull()
})

/* ------------------------------------------------------------------------
 * The About tab — the corkboard (STOURIFY-147)
 * ---------------------------------------------------------------------- */

/**
 * The tab's whole promise to the reader is its ORDER: the notes other visitors
 * found useful sit at the top. The server decides that order and the screen
 * renders it — so this asserts the sequence, not the presence. Three rows in
 * any order would pass a length check, including a reversed one.
 */
it('lists the notes in the order the server sent them, most-liked first', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(
    aboutPage([
      makeAbout({
        uuid: 'a-popular',
        body: 'Go at sunrise.',
        likes_count: 5,
        author: { uuid: 'u1', name: 'Mila Reyes', username: 'mila', avatar_url: null },
      }),
      makeAbout({
        uuid: 'a-middling',
        body: 'The side entrance is the open one.',
        likes_count: 2,
        author: { uuid: 'u2', name: 'Ben Cruz', username: null, avatar_url: null },
      }),
      makeAbout({
        uuid: 'a-fresh',
        body: 'Parking is behind the church.',
        likes_count: 0,
        author: { uuid: 'u3', name: 'Ana Lim', username: null, avatar_url: null },
      }),
    ]),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getAllByTestId('spot-about-row')).toHaveLength(3))

  const rows = screen.getAllByTestId('spot-about-row')
  expect(within(rows[0]).getByText('Go at sunrise.')).toBeTruthy()
  expect(within(rows[1]).getByText('The side entrance is the open one.')).toBeTruthy()
  expect(within(rows[2]).getByText('Parking is behind the church.')).toBeTruthy()
})

/**
 * The card asks for "information of who added and datetime". A raw ISO
 * timestamp technically satisfies "datetime" and helps nobody standing in front
 * of a landmark, so the assertion is on the readable form.
 */
it('shows who wrote each note and how long ago, not a raw timestamp', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(aboutPage([makeAbout()]))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getByText('Mila Reyes')).toBeTruthy())
  expect(screen.getByText('2 hours ago')).toBeTruthy()
})

/**
 * The corkboard hangs BESIDE the brass plaque, not over it. The spot's own
 * description, address and coordinates are facts nothing else in the app shows,
 * and the first ASSUMPTION on STOURIFY-147 is the decision to keep them — this
 * is the test that would catch somebody quietly dropping them later.
 */
it('keeps the spot description, address and coordinates above the notes', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(aboutPage([makeAbout()]))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  // Wait for the NOTE, not for the description. The description is on screen
  // from the first frame of the tab, so waiting for it returns while the notes
  // request is still in flight and the three assertions below race it.
  await waitFor(() =>
    expect(screen.getByText('Go at sunrise, the light is worth it.')).toBeTruthy(),
  )
  expect(screen.getByText('A quiet cove.')).toBeTruthy()

  // The address and coordinate moved OUT of this tab and up under the title
  // (STOURIFY-210), so they are on screen whichever tab is showing -- which is
  // the whole point, since this is not the tab the screen opens on.
  expect(screen.getByText('Coastal Road')).toBeTruthy()
  expect(screen.getByTestId('spot-coordinates')).toBeTruthy()
})

/**
 * Three situations that all show no notes, and they are not the same claim:
 * "we are still asking", "we could not ask", "we asked and there is nothing".
 * Saying the wrong one is how a reader whose network just dropped is told a
 * spot has no notes — a statement about the spot rather than about the network.
 */
it('shows placeholders, and claims nothing about the notes, while the request is in flight', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock).mockReturnValue(new Promise(() => {}))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getByTestId('spot-abouts-loading')).toBeTruthy())
  expect(screen.queryByText('No notes yet')).toBeNull()
  expect(screen.queryByText("Couldn't load the notes")).toBeNull()
})

it('says the notes request failed, and offers a retry that actually asks again', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock).mockRejectedValue(new Error('offline'))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getByText("Couldn't load the notes")).toBeTruthy())
  expect(screen.queryByText('No notes yet')).toBeNull()
  expect(screen.queryByTestId('spot-abouts-loading')).toBeNull()

  const before = (getSpotAbouts as jest.Mock).mock.calls.length
  fireEvent.press(screen.getByText('Try again'))
  await waitFor(() =>
    expect((getSpotAbouts as jest.Mock).mock.calls.length).toBeGreaterThan(before),
  )
})

it('invites the first note when the spot genuinely has none', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(aboutPage([]))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getByText('No notes yet')).toBeTruthy())
  expect(screen.queryByText("Couldn't load the notes")).toBeNull()
  expect(screen.queryByTestId('spot-abouts-loading')).toBeNull()
})

/**
 * A heart that waits for the network before filling in reads as a broken
 * button. The mocked request never settles on purpose: what is asserted is the
 * frame BEFORE any answer arrives, which is the only frame the user sees.
 */
it('fills the heart and raises the count before the request has answered', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(
    aboutPage([makeAbout({ likes_count: 5, is_liked: false })]),
  )
  ;(addReaction as jest.Mock).mockReturnValue(new Promise(() => {}))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getByTestId('spot-about-like-about-1')).toBeTruthy())
  expect(screen.getByText('5')).toBeTruthy()

  fireEvent.press(screen.getByTestId('spot-about-like-about-1'))

  await waitFor(() => expect(screen.getByText('6')).toBeTruthy())
  expect(screen.getByTestId('spot-about-like-about-1').props.accessibilityState.selected).toBe(true)
  expect(addReaction).toHaveBeenCalledWith('stourify_spot_about', 'about-1')
  expect(removeReaction).not.toHaveBeenCalled()
})

/**
 * Removing a like says DELETE rather than posting the same reaction again. The
 * endpoint would treat a repeated POST as "take it back" and get the same result
 * today — but only while the app's idea of the current state is right. Stating
 * the intention is what stops a stale screen turning "like this" into "unlike
 * this".
 */
it('removes a like with removeReaction, never by posting the same reaction twice', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(
    aboutPage([makeAbout({ likes_count: 5, is_liked: true })]),
  )
  ;(removeReaction as jest.Mock).mockReturnValue(new Promise(() => {}))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getByTestId('spot-about-like-about-1')).toBeTruthy())
  fireEvent.press(screen.getByTestId('spot-about-like-about-1'))

  await waitFor(() => expect(screen.getByText('4')).toBeTruthy())
  expect(removeReaction).toHaveBeenCalledWith('stourify_spot_about', 'about-1')
  expect(addReaction).not.toHaveBeenCalled()
})

/**
 * The other half of an optimistic update, and the half people forget. A screen
 * that flips instantly and then keeps the flip after the server refused is
 * worse than one that never flipped: it reports a like nobody recorded.
 */
it('puts the heart and the count back when the like request fails', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(
    aboutPage([makeAbout({ likes_count: 5, is_liked: false })]),
  )

  // The rejection is held back until the optimistic frame has been observed.
  // Rejecting straight away makes the flip and the revert land in the same
  // batch, and a test that then waits for the flip is racing a value that may
  // never have been on screen — green on a slow machine, red on a fast one.
  let failTheRequest = () => {}
  ;(addReaction as jest.Mock).mockReturnValue(
    new Promise((_resolve, reject) => {
      failTheRequest = () => reject(new Error('offline'))
    }),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getByTestId('spot-about-like-about-1')).toBeTruthy())
  fireEvent.press(screen.getByTestId('spot-about-like-about-1'))

  await waitFor(() => expect(screen.getByText('6')).toBeTruthy())

  failTheRequest()

  await waitFor(() => expect(screen.getByText('5')).toBeTruthy())
  expect(screen.getByTestId('spot-about-like-about-1').props.accessibilityState.selected).toBe(
    false,
  )
})

/**
 * "Without a manual refresh" is the actual requirement, so the list mock answers
 * differently the second time: empty first, then holding the new note. A test
 * that only checked the POST would pass against a screen that never showed what
 * was written.
 */
it('adds a note and shows it without the reader doing anything else', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock)
    .mockResolvedValueOnce(aboutPage([]))
    .mockResolvedValue(
      aboutPage([
        makeAbout({ uuid: 'about-new', body: 'Parking is behind the church.', likes_count: 0 }),
      ]),
    )
  ;(createSpotAbout as jest.Mock).mockResolvedValue(
    makeAbout({ uuid: 'about-new', body: 'Parking is behind the church.' }),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getByTestId('spot-about-composer')).toBeTruthy())
  fireEvent.changeText(
    screen.getByTestId('spot-about-composer'),
    '  Parking is behind the church.  ',
  )
  fireEvent.press(screen.getByLabelText('Post note'))

  // The stray spaces are trimmed off — what the server stores is what the reader
  // meant to write, not what their thumb added either side of it.
  await waitFor(() =>
    expect(createSpotAbout).toHaveBeenCalledWith('spot-1', 'Parking is behind the church.'),
  )
  await waitFor(() => expect(screen.getByText('Parking is behind the church.')).toBeTruthy())
  expect(screen.getByTestId('spot-about-composer').props.value).toBe('')
})

it('does nothing when the box is empty, or holds only spaces', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(aboutPage([]))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getByTestId('spot-about-composer')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('Post note'))
  expect(createSpotAbout).not.toHaveBeenCalled()

  fireEvent.changeText(screen.getByTestId('spot-about-composer'), '     ')
  fireEvent.press(screen.getByLabelText('Post note'))
  expect(createSpotAbout).not.toHaveBeenCalled()
})

/**
 * The reply count is now a door (STOURIFY-148).
 *
 * STOURIFY-147 shipped the number as plain text on purpose, because the room
 * behind it had not been built and a control that opens nothing is worse than
 * no control. The room exists now, so this asserts the opposite of what it
 * asserted then: the count is pressable, and pressing it opens THAT note's
 * thread and no other.
 *
 * The parameter is checked exactly, not merely for the uuid. Sending `postId`
 * here would open the post endpoint against a note's uuid, which does not
 * error — it returns somebody else's empty thread.
 */
it('opens a note’s replies when the reply count is pressed', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(
    aboutPage([makeAbout({ uuid: 'about-7', comments_count: 2 })]),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() => expect(screen.getByText('💬 2')).toBeTruthy())

  fireEvent.press(screen.getByLabelText('View replies'))

  // The spot and the note travel WITH the id (STOURIFY-198). Asserting them
  // here rather than only the id is the point: the thread screen has no other
  // source for these words, so a caller that quietly stopped passing them would
  // leave the reader on an unlabelled thread and break nothing a test could see.
  expect(navigation.navigate).toHaveBeenCalledWith('Comments', {
    spotAboutId: 'about-7',
    spotTitle: 'Blue Cove',
    noteBody: 'Go at sunrise, the light is worth it.',
    noteAuthor: 'Mila Reyes',
  })
})

/**
 * A count the server did not compute is absent, not zero. Rendering "0 replies"
 * over a field nobody looked up is a confident answer to a question that was
 * never asked — and it would look identical to a note nobody replied to.
 */
it('prints no reply count at all when the server did not send one', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
  const withoutCount = makeAbout()
  delete (withoutCount as Record<string, unknown>).comments_count
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(aboutPage([withoutCount]))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  await waitFor(() =>
    expect(screen.getByText('Go at sunrise, the light is worth it.')).toBeTruthy(),
  )
  expect(screen.queryByText('💬 0')).toBeNull()
  // No count means no door either — there is nothing to say how many replies
  // are behind it, so the row offers none.
  expect(screen.queryByLabelText('View replies')).toBeNull()
})

/**
 * STOURIFY-196 — the Note box has to be reachable while you are typing in it.
 *
 * Under edge-to-edge, Android stopped shrinking the window when the keyboard
 * opens, so the keyboard is simply drawn over whatever sits at the bottom of
 * the screen. On this screen that is the Note composer at the end of the About
 * section: you tapped it, the keyboard covered it, and you were typing into a
 * box you could not see.
 *
 * **This assertion is weaker than the bug.** It checks the mechanism is present,
 * not that the box ends up above the keyboard — no unit test can see that,
 * because there is no keyboard and no window to shrink. It is here to stop the
 * wrapper being removed silently during a refactor; confirming the fix itself
 * takes a device, and the card's review steps say so.
 */
it('keeps the Note composer clear of the keyboard', async () => {
  renderScreen()

  await waitFor(() => {
    expect(screen.getByTestId('spot-detail-keyboard-avoider')).toBeTruthy()
  })
})

/**
 * STOURIFY-201 — the hero shows every photo, not just the first.
 *
 * It drew `media[0]` and nothing else, so a spot with five photos looked
 * exactly like a spot with one. The only way to find out otherwise was to tap
 * through to the gallery, which is something you do when you already believe
 * there is more to see.
 */
describe('the hero pager', () => {
  it('renders every photo, not only the first', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
    ;(getSpotPosts as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('spot-hero-pager')).toBeTruthy())

    // The fixture carries two photos, and both must be mounted — one image
    // would be the old behaviour passing under a new name.
    expect(screen.getAllByTestId('spot-hero-image')).toHaveLength(2)
  })

  it('shows a dot per photo when there is more than one', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
    ;(getSpotPosts as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('spot-hero-dots')).toBeTruthy())
  })

  /**
   * A single dot under a single photo is a claim that there is something to
   * swipe to. So is a hero that can be dragged when there is nowhere to drag.
   */
  it('draws no dots, and does not scroll, for a spot with one photo', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(
      makeSpot({ media: [{ uuid: 'm1', url: 'https://cdn.test/photo1.jpg', thumb_url: null }] }),
    )
    ;(getSpotPosts as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('spot-hero-pager')).toBeTruthy())

    expect(screen.queryByTestId('spot-hero-dots')).toBeNull()
    expect(screen.getByTestId('spot-hero-pager').props.scrollEnabled).toBe(false)
  })

  // The hero is a preview; the gallery is the reading room. Swiping here must
  // not have cost us the way through to the full-screen view.
  it('still opens the gallery when the hero is tapped', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
    ;(getSpotPosts as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('spot-hero-pager')).toBeTruthy())
    fireEvent.press(screen.getByTestId('spot-hero'))

    expect(navigation.navigate).toHaveBeenCalledWith('PhotoGallery', { spotId: 'spot-1' })
  })
})

/**
 * STOURIFY-210 — where the spot is, under the title, and a way to go there.
 *
 * The address and coordinate used to live inside the About tab. That is not the
 * tab this screen opens on, so the one fact everybody wants from a place was
 * behind a tap — and on a spot with no description the tab looked empty enough
 * to seem broken.
 */
describe('the location line', () => {
  function mockSpot(overrides: Partial<any> = {}) {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot(overrides))
    ;(getSpotPosts as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })
  }

  it('shows where the spot is without switching tabs', async () => {
    mockSpot()
    renderScreen()

    // No tab press anywhere in this test — that is the assertion.
    await waitFor(() => expect(screen.getByTestId('spot-location')).toBeTruthy())

    expect(screen.getByText('Coastal Road')).toBeTruthy()
    expect(screen.getByTestId('spot-coordinates')).toBeTruthy()
  })

  it('opens the map app when pressed', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any)
    mockSpot()
    renderScreen()

    await waitFor(() => expect(screen.getByTestId('spot-location')).toBeTruthy())
    fireEvent.press(screen.getByTestId('spot-location'))

    await waitFor(() => expect(openURL).toHaveBeenCalled())

    // The coordinate has to actually be in the link. A map opened at the wrong
    // place is worse than one that does not open.
    expect(openURL.mock.calls[0][0]).toContain('6.1')
    expect(openURL.mock.calls[0][0]).toContain('125.2')
  })

  /**
   * A spot whose contributor hid its location has an address and no coordinate
   * (STOURIFY-185). It must still say roughly where it is, and must NOT look
   * openable — a control identical to the one above that does nothing when
   * pressed is worse than plain text.
   */
  it('shows a plain, unpressable address when the coordinate is withheld', async () => {
    mockSpot({ latitude: null, longitude: null })
    renderScreen()

    await waitFor(() => expect(screen.getByTestId('spot-location-static')).toBeTruthy())

    expect(screen.getByText('Coastal Road')).toBeTruthy()
    expect(screen.queryByTestId('spot-location')).toBeNull()
  })

  /**
   * Neither an address nor a coordinate. This used to render nothing at all,
   * and nothing is indistinguishable from a screen that failed to load — a
   * person cannot tell "this place has no location on it" from "the app is
   * broken" (STOURIFY-240).
   *
   * The wording says what happened and not why: the response has no `latitude`
   * key, and absence carries no reason with it. Claiming the contributor hid
   * it would be a guess printed as a fact, on the one screen where guessing
   * about location is the failure being designed out.
   */
  it('says the location is not shown when there is neither an address nor a coordinate', async () => {
    mockSpot({ address: null, latitude: null, longitude: null })
    renderScreen()

    await waitFor(() => expect(screen.getByTestId('spot-location-hidden')).toBeTruthy())
    expect(screen.getByText('Location not shown')).toBeTruthy()

    // Still nothing that looks openable, and no orphan coordinate line.
    expect(screen.queryByTestId('spot-location')).toBeNull()
    expect(screen.queryByTestId('spot-location-static')).toBeNull()
    expect(screen.queryByTestId('spot-coordinates')).toBeNull()
  })

  /** The two honest empty states are different states, and only one at a time. */
  it('does not say the location is not shown when there is an address', async () => {
    mockSpot({ latitude: null, longitude: null })
    renderScreen()

    await waitFor(() => expect(screen.getByTestId('spot-location-static')).toBeTruthy())
    expect(screen.queryByTestId('spot-location-hidden')).toBeNull()
  })

  // Latitude 0 is the equator and longitude 0 is Greenwich. Both are real
  // places that a truthiness guard would hide (STOURIFY-65).
  it('treats 0, 0 as a real place', async () => {
    mockSpot({ latitude: 0, longitude: 0 })
    renderScreen()

    await waitFor(() => expect(screen.getByTestId('spot-location')).toBeTruthy())
    expect(screen.getByText('0.0000, 0.0000')).toBeTruthy()
  })
})

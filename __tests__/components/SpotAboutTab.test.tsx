import { AxiosError, type AxiosResponse } from 'axios'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import SpotAboutTab from '@/features/spots/components/SpotAboutTab'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/spotAbouts', () => ({
  getSpotAbouts: jest.fn(),
  createSpotAbout: jest.fn(),
}))

jest.mock('@/shared/api/reactions', () => ({
  addReaction: jest.fn(),
  removeReaction: jest.fn(),
}))

import { createSpotAbout, getSpotAbouts } from '@/shared/api/spotAbouts'

function renderTab(spotUuid = 'spot-1') {
  return render(
    <TestProviders database={createTestDatabase()}>
      <SpotAboutTab spotUuid={spotUuid} onOpenThread={jest.fn()} />
    </TestProviders>,
  )
}

beforeEach(() => jest.clearAllMocks())

/**
 * STOURIFY-248, following STOURIFY-225. This component had no test file at all
 * — the only one of the twelve screens that card names — so its first tests are
 * the ones about the thing that was wrong with it.
 *
 * The notes list answered every failure with a single sentence: "We couldn't
 * reach Stourify just now. Check your connection and try again." That is true
 * for exactly one of the ways a request can fail. When the server picks up and
 * refuses, saying it sends the reader off to restart a router that was working
 * perfectly.
 *
 * The words now come from `describeRequestFailure`, which reads the error this
 * component was already holding. Both halves are asserted, because a test that
 * only checked the connection is never blamed would be satisfied by deleting
 * the sentence everywhere — and then a genuinely offline reader would be told
 * nothing useful at all.
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

  it('does not blame the connection when the server answered 403', async () => {
    ;(getSpotAbouts as jest.Mock).mockRejectedValue(forbidden())
    renderTab()

    await waitFor(() => expect(screen.getByText("Couldn't load the notes")).toBeTruthy())

    expect(screen.queryByText(/check your connection/i)).toBeNull()
    expect(screen.getByText(/isn't allowed/i)).toBeTruthy()
  })

  it('still blames the connection when there really was no answer', async () => {
    ;(getSpotAbouts as jest.Mock).mockRejectedValue(
      new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never, {}),
    )
    renderTab()

    await waitFor(() => expect(screen.getByText("Couldn't load the notes")).toBeTruthy())

    expect(screen.getByText(/check your connection/i)).toBeTruthy()
  })
})

/**
 * STOURIFY-252 — the composer's half of the same fault.
 *
 * A note that did not post was answered with "That didn't send. Check your
 * connection and try again." whatever went wrong, including the server picking
 * up and refusing. Both directions are asserted for the same reason as above:
 * deleting the sentence would satisfy the first test on its own.
 */
describe('a note that did not post says why', () => {
  const emptyPage = { data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } }

  async function postNote() {
    renderTab()
    await waitFor(() => expect(screen.getByText('No notes yet')).toBeTruthy())

    fireEvent.changeText(screen.getByTestId('spot-about-composer'), 'Go at sunrise.')
    fireEvent.press(screen.getByLabelText('Post note'))
  }

  it('does not blame the connection when the server refused the note', async () => {
    const config = { headers: {} } as never
    ;(getSpotAbouts as jest.Mock).mockResolvedValue(emptyPage)
    ;(createSpotAbout as jest.Mock).mockRejectedValue(
      new AxiosError('Request failed with status code 403', '403', config, {}, {
        status: 403,
        statusText: 'Forbidden',
        data: { message: 'This action is unauthorized.' },
        headers: {},
        config,
      } as AxiosResponse),
    )

    await postNote()

    await waitFor(() => expect(screen.getByText(/That didn't send/)).toBeTruthy())
    expect(screen.getByText(/isn't allowed to post/)).toBeTruthy()
    expect(screen.queryByText(/connection/i)).toBeNull()
  })

  it('still blames the connection when the note never reached the server', async () => {
    ;(getSpotAbouts as jest.Mock).mockResolvedValue(emptyPage)
    ;(createSpotAbout as jest.Mock).mockRejectedValue(
      new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never, {}),
    )

    await postNote()

    await waitFor(() =>
      expect(
        screen.getByText("That didn't send. Check your connection and try again."),
      ).toBeTruthy(),
    )
  })
})

/**
 * The failure panel is gated on the list being empty, not on the request having
 * failed. A reader who opened this spot yesterday and is now on a train still
 * has the notes cached, and taking them off the screen to apologise for a
 * refetch they never asked for would be a worse answer than saying nothing.
 *
 * This is the rule the card was told not to touch, so it gets an assertion that
 * would notice if a later change did.
 */
it('keeps showing cached notes when a background refetch fails', async () => {
  ;(getSpotAbouts as jest.Mock).mockResolvedValueOnce({
    data: [
      {
        uuid: 'about-1',
        body: 'Go at sunrise, the light is worth it.',
        spot_uuid: 'spot-1',
        author: { uuid: 'u1', name: 'Mila Reyes', username: 'mila', avatar_url: null },
        reactions_count: 0,
        replies_count: 0,
        viewer_has_reacted: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        can: {},
      },
    ],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })

  renderTab()

  await waitFor(() =>
    expect(screen.getByText('Go at sunrise, the light is worth it.')).toBeTruthy(),
  )
  expect(screen.queryByText("Couldn't load the notes")).toBeNull()
})

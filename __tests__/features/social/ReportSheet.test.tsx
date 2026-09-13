import { AxiosError } from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import ReportSheet from '@/features/social/components/ReportSheet'
import { ThemeProvider } from '@/theme/ThemeProvider'

// `Sheet` reads the bottom inset to keep its primary action clear of the tab bar
// and the gesture bar, so it needs the provider like any screen does.
const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

/**
 * The report form (STOURIFY-37), in the Settings design's artboard 5 dress
 * (STOURIFY-291).
 *
 * Two things are held here. The look — the design's title, prompt, reason
 * wording and "Report received" — may change. What a report SENDS may not:
 * every `fileReport` assertion below is the one STOURIFY-37 wrote, unchanged,
 * because moderation reads those rows.
 *
 * The seam worth holding hardest is the "other needs an explanation" rule.
 * `ReportStoreRequest` enforces it server-side, so a form that does not
 * enforce it locally works — it just makes the person wait for a round trip to
 * be told something the app already knew. An implementation that drops the
 * local check fails here and nowhere else.
 */

jest.mock('@/shared/api/reports', () => {
  const actual = jest.requireActual('@/shared/api/reports')
  return { ...actual, fileReport: jest.fn() }
})

import { fileReport } from '@/shared/api/reports'
import { trackQueryClient } from '../../support/queryClients'

function renderSheet(props: Partial<React.ComponentProps<typeof ReportSheet>> = {}) {
  const qc = trackQueryClient(
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    }),
  )
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider scheme="light">
        <QueryClientProvider client={qc}>
          <ReportSheet
            visible
            reportableType="post"
            reportableUuid="post-1"
            onClose={jest.fn()}
            {...props}
          />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => jest.clearAllMocks())

test('it is the design’s "Report content", and says the report is anonymous', () => {
  renderSheet()

  expect(screen.getByText('Report content')).toBeTruthy()
  // True, not decoration: `ReportResource` withholds `reporter_uuid` from
  // everyone but moderators and the reporter (see the card's ASSUMPTION note).
  expect(screen.getByText('Why are you reporting this? Your report is anonymous.')).toBeTruthy()
})

test('the reasons the server accepts are offered in the design’s words', () => {
  renderSheet()

  for (const label of [
    'Spam or misleading',
    'Inappropriate or offensive',
    'Wrong or outdated info',
    'Harassment or bullying',
    'Something else',
  ]) {
    expect(screen.getByRole('radio', { name: label })).toBeTruthy()
  }
})

test('picking a reason marks that one, and only that one', () => {
  renderSheet()

  fireEvent.press(screen.getByText('Spam or misleading'))
  fireEvent.press(screen.getByText('Harassment or bullying'))

  expect(
    screen.getByRole('radio', { name: 'Harassment or bullying' }).props.accessibilityState,
  ).toEqual(expect.objectContaining({ checked: true }))
  expect(
    screen.getByRole('radio', { name: 'Spam or misleading' }).props.accessibilityState,
  ).toEqual(expect.objectContaining({ checked: false }))
})

test('nothing is filed until a reason is chosen: the submit is disabled', () => {
  renderSheet()

  const submit = screen.getByLabelText('Submit report')
  expect(submit.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }))

  fireEvent.press(submit)
  expect(fileReport).not.toHaveBeenCalled()
})

test('the details field is optional, until "Something else" makes it required', () => {
  renderSheet()

  expect(screen.getByText('Add details (optional)')).toBeTruthy()
  fireEvent.press(screen.getByText('Something else'))
  expect(screen.getByText('Add details (required)')).toBeTruthy()
})

test('choosing "something else" without describing the problem does not submit', () => {
  renderSheet()

  fireEvent.press(screen.getByText('Something else'))
  fireEvent.press(screen.getByLabelText('Submit report'))

  // The rule is the server's (`details` is required when reason is `other`).
  // Enforcing it here is what keeps a predictable 422 off the screen.
  expect(fileReport).not.toHaveBeenCalled()
  expect(screen.getByText(/add a description/i)).toBeTruthy()
})

test('a reason with a description files the report with the details attached', async () => {
  ;(fileReport as jest.Mock).mockResolvedValue({ uuid: 'report-1' })
  renderSheet()

  fireEvent.press(screen.getByText('Something else'))
  fireEvent.changeText(screen.getByTestId('report-details'), 'They keep posting my address.')
  fireEvent.press(screen.getByLabelText('Submit report'))

  await waitFor(() =>
    expect(fileReport).toHaveBeenCalledWith({
      reportableType: 'post',
      reportableUuid: 'post-1',
      reason: 'other',
      details: 'They keep posting my address.',
    }),
  )
})

test('an ordinary reason files without a description', async () => {
  ;(fileReport as jest.Mock).mockResolvedValue({ uuid: 'report-1' })
  renderSheet()

  fireEvent.press(screen.getByText('Spam or misleading'))
  fireEvent.press(screen.getByLabelText('Submit report'))

  await waitFor(() =>
    expect(fileReport).toHaveBeenCalledWith({
      reportableType: 'post',
      reportableUuid: 'post-1',
      reason: 'spam',
      details: undefined,
    }),
  )
})

test('the relabelled reasons still send the server’s own values', async () => {
  ;(fileReport as jest.Mock).mockResolvedValue({ uuid: 'report-1' })
  renderSheet()

  fireEvent.press(screen.getByText('Wrong or outdated info'))
  fireEvent.press(screen.getByLabelText('Submit report'))

  await waitFor(() =>
    expect(fileReport).toHaveBeenCalledWith(expect.objectContaining({ reason: 'wrong_info' })),
  )
})

test('reporting a person sends the user token, not the post one', async () => {
  ;(fileReport as jest.Mock).mockResolvedValue({ uuid: 'report-2' })
  renderSheet({ reportableType: 'user', reportableUuid: 'user-other' })

  fireEvent.press(screen.getByText('Harassment or bullying'))
  fireEvent.press(screen.getByLabelText('Submit report'))

  await waitFor(() =>
    expect(fileReport).toHaveBeenCalledWith(
      expect.objectContaining({ reportableType: 'user', reportableUuid: 'user-other' }),
    ),
  )
})

test('a successful filing says "Report received", and Done closes the sheet', async () => {
  ;(fileReport as jest.Mock).mockResolvedValue({ uuid: 'report-1' })
  const onClose = jest.fn()
  renderSheet({ onClose })

  fireEvent.press(screen.getByText('Spam or misleading'))
  fireEvent.press(screen.getByLabelText('Submit report'))

  expect(await screen.findByText('Report received')).toBeTruthy()
  expect(
    screen.getByText('Thanks for helping keep Stourify safe. Our team will review it shortly.'),
  ).toBeTruthy()

  fireEvent.press(screen.getByLabelText('Done'))
  expect(onClose).toHaveBeenCalled()
})

test('a second report of the same thing is success, not an error', async () => {
  // The server answers 200 with the report that already exists rather than
  // erroring. A client that treated the absence of a 201 as a failure would
  // tell the reporter their report did not go through when it did.
  ;(fileReport as jest.Mock).mockResolvedValue({ uuid: 'report-existing', status: 'pending' })
  renderSheet()

  fireEvent.press(screen.getByText('Spam or misleading'))
  fireEvent.press(screen.getByLabelText('Submit report'))

  expect(await screen.findByText('Report received')).toBeTruthy()
})

test('a rejected filing says so and leaves the sheet open to retry', async () => {
  // A real AxiosError, not a lookalike: `extractApiError` reaches the server's
  // own message through `axios.isAxiosError`, and a plain object with the same
  // shape falls through to the generic fallback. A test built on the lookalike
  // would pass against a component that never surfaced a server message at all.
  const rejection = new AxiosError('Request failed')
  rejection.response = {
    status: 500,
    data: { message: 'Server error.' },
    statusText: 'Server Error',
    headers: {},
    config: { headers: {} as never },
  }
  ;(fileReport as jest.Mock).mockRejectedValue(rejection)
  renderSheet()

  fireEvent.press(screen.getByText('Spam or misleading'))
  fireEvent.press(screen.getByLabelText('Submit report'))

  expect(await screen.findByText(/server error/i)).toBeTruthy()
  expect(screen.getByLabelText('Submit report')).toBeTruthy()
  expect(screen.queryByText('Report received')).toBeNull()
})

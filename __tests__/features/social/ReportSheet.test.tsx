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
 * The report form (STOURIFY-37).
 *
 * The seam worth holding here is the "other needs an explanation" rule.
 * `ReportStoreRequest` enforces it server-side, so a form that does not
 * enforce it locally works — it just makes the person wait for a round trip to
 * be told something the app already knew, and 422 messages are the least
 * friendly place to learn a rule. An implementation that drops the local check
 * fails here and nowhere else.
 */

jest.mock('@/shared/api/reports', () => {
  const actual = jest.requireActual('@/shared/api/reports')
  return { ...actual, fileReport: jest.fn() }
})

import { fileReport } from '@/shared/api/reports'

function renderSheet(props: Partial<React.ComponentProps<typeof ReportSheet>> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
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

test('the reasons the server accepts are the reasons offered', () => {
  renderSheet()

  expect(screen.getByText('Spam or misleading')).toBeTruthy()
  expect(screen.getByText('Inappropriate content')).toBeTruthy()
  expect(screen.getByText('Wrong information')).toBeTruthy()
  expect(screen.getByText('Harassment or bullying')).toBeTruthy()
  expect(screen.getByText('Something else')).toBeTruthy()
})

test('nothing is filed until a reason is chosen', () => {
  renderSheet()

  fireEvent.press(screen.getByLabelText('Submit report'))

  expect(fileReport).not.toHaveBeenCalled()
  expect(screen.getByText(/choose a reason/i)).toBeTruthy()
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

test('a successful filing thanks the reporter rather than closing silently', async () => {
  ;(fileReport as jest.Mock).mockResolvedValue({ uuid: 'report-1' })
  renderSheet()

  fireEvent.press(screen.getByText('Spam or misleading'))
  fireEvent.press(screen.getByLabelText('Submit report'))

  expect(await screen.findByText(/thank you/i)).toBeTruthy()
})

test('a second report of the same thing is success, not an error', async () => {
  // The server answers 200 with the report that already exists rather than
  // erroring. A client that treated the absence of a 201 as a failure would
  // tell the reporter their report did not go through when it did.
  ;(fileReport as jest.Mock).mockResolvedValue({ uuid: 'report-existing', status: 'pending' })
  renderSheet()

  fireEvent.press(screen.getByText('Spam or misleading'))
  fireEvent.press(screen.getByLabelText('Submit report'))

  expect(await screen.findByText(/thank you/i)).toBeTruthy()
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
})

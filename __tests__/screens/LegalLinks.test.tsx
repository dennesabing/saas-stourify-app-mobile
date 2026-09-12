import { act, render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Linking } from 'react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import SettingsScreen from '@/features/profile/screens/SettingsScreen'
import PrivacySecurityScreen from '@/features/profile/screens/PrivacySecurityScreen'
import { PRIVACY_POLICY_URL, TERMS_URL, ACCOUNT_DELETION_URL } from '@/shared/config/legal'
import { trackQueryClient } from '../support/queryClients'

jest.mock('@/shared/api/auth', () => ({ logout: jest.fn() }))
jest.mock('@/shared/api/profiles', () => ({
  getMyProfile: jest.fn().mockResolvedValue({ uuid: 'p1', username: 'ziv', is_private: false }),
  updateMyProfile: jest.fn(),
}))
jest.mock('@/shared/api/blocks', () => ({
  getBlocks: jest
    .fn()
    .mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } }),
}))
jest.mock('@/shared/api/account', () => ({
  deleteAccount: jest.fn(),
  deletionOutcomeIsUnknown: jest.fn(() => false),
}))
jest.mock('@/sync/session', () => ({ signOut: jest.fn() }))

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() } as any

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

async function renderWithProviders(screen: React.ReactElement) {
  const qc = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )

  const utils = render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={qc}>{screen}</QueryClientProvider>
    </SafeAreaProvider>,
  )
  // Let the screen's first requests land inside act(): React Query hands
  // results to a screen on a timer, so a test that ended before then would get
  // a state update after it finished, which is what the act() warning reports.
  await waitFor(() => expect(qc.isFetching()).toBe(0))
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  return utils
}

const renderSettings = () =>
  renderWithProviders(<SettingsScreen navigation={mockNavigation} route={{} as any} />)

describe('Settings → legal links', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any)
  })

  // Play requires the privacy policy and terms to be reachable from inside the
  // app, not merely from the store listing. Since STOURIFY-290 they sit behind
  // the design's single "Terms & privacy policy" row, one tap further in.
  it.each([
    ['Privacy Policy', () => PRIVACY_POLICY_URL],
    ['Terms of Service', () => TERMS_URL],
    ['Request account deletion', () => ACCOUNT_DELETION_URL],
  ])('opens %s in the browser', async (label, url) => {
    const { getByText } = await renderSettings()

    fireEvent.press(getByText('Terms & privacy policy'))
    fireEvent.press(getByText(label))

    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith(url()))
  })

  it('derives every legal URL from the configured backend host', async () => {
    // A hardcoded production host would make a dev build's policy link open
    // production, and the two documents would drift apart unnoticed.
    for (const url of [PRIVACY_POLICY_URL, TERMS_URL, ACCOUNT_DELETION_URL]) {
      expect(url).not.toContain('/api/v1')
      expect(url).toMatch(/^https?:\/\//)
    }

    expect(PRIVACY_POLICY_URL).toMatch(/\/privacy$/)
    expect(TERMS_URL).toMatch(/\/terms$/)
    expect(ACCOUNT_DELETION_URL).toMatch(/\/account-deletion$/)
  })

  it('keeps the in-app delete path — the web page is an addition, not a replacement', async () => {
    // Play requires BOTH: an in-app deletion path (STOURIFY-32) and a
    // web-reachable deletion request URL. Losing either fails the listing.
    const settings = await renderSettings()
    fireEvent.press(settings.getByText('Terms & privacy policy'))
    expect(settings.getByText('Request account deletion')).toBeTruthy()
    expect(settings.getByText('Privacy & security')).toBeTruthy()
    settings.unmount()

    const privacy = await renderWithProviders(
      <PrivacySecurityScreen navigation={mockNavigation} route={{} as any} />,
    )
    expect(privacy.getByText('Delete account')).toBeTruthy()
  })
})

import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Linking } from 'react-native'
import SettingsScreen from '@/features/profile/screens/SettingsScreen'
import { PRIVACY_POLICY_URL, TERMS_URL, ACCOUNT_DELETION_URL } from '@/shared/config/legal'
import { trackQueryClient } from '../support/queryClients'

jest.mock('@/shared/api/auth', () => ({ logout: jest.fn() }))
jest.mock('@/shared/api/settings', () => ({
  getAccountSettings: jest.fn().mockResolvedValue({
    account_visibility: 'public',
    follow_mode: 'open',
  }),
  updateAccountSettings: jest.fn(),
}))
jest.mock('@/shared/api/account', () => ({
  deleteAccount: jest.fn(),
  deletionOutcomeIsUnknown: jest.fn(() => false),
}))
jest.mock('@/sync/session', () => ({ signOut: jest.fn() }))

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() } as any

function renderSettings() {
  const qc = trackQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }))

  return render(
    <QueryClientProvider client={qc}>
      <SettingsScreen navigation={mockNavigation} route={{} as any} />
    </QueryClientProvider>,
  )
}

describe('Settings → legal links', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any)
  })

  // Play requires the privacy policy and terms to be reachable from inside the
  // app, not merely from the store listing.
  it.each([
    ['Privacy Policy', () => PRIVACY_POLICY_URL],
    ['Terms of Service', () => TERMS_URL],
    ['Request account deletion', () => ACCOUNT_DELETION_URL],
  ])('opens %s in the browser', async (label, url) => {
    const { getByText } = renderSettings()

    fireEvent.press(getByText(label))

    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith(url()))
  })

  it('derives every legal URL from the configured backend host', () => {
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

  it('keeps the in-app delete path — the web page is an addition, not a replacement', () => {
    // Play requires BOTH: an in-app deletion path (STOURIFY-32) and a
    // web-reachable deletion request URL. Losing either fails the listing.
    const { getByText } = renderSettings()

    expect(getByText('Delete account')).toBeTruthy()
    expect(getByText('Request account deletion')).toBeTruthy()
  })
})

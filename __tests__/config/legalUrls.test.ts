/**
 * STOURIFY-191 — the legal links point at the website, not at the API server.
 *
 * These pages are what a person is sent to read before agreeing to something,
 * and the address bar is part of what they are being asked to trust. Deriving
 * it from the backend's address put `api.stourify.com` in front of them on the
 * one screen where that is least appropriate.
 *
 * The module reads its environment once when it loads, so each case resets the
 * module registry and re-imports it rather than trying to change a value the
 * module has already read.
 */
function loadLegal(env: Record<string, string | undefined>) {
  const previous = { ...process.env }

  jest.resetModules()
  Object.assign(process.env, env)

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const legal = require('@/shared/config/legal') as typeof import('@/shared/config/legal')

  process.env = previous

  return legal
}

it('sends readers to the website when one is configured', () => {
  const legal = loadLegal({
    EXPO_PUBLIC_API_URL: 'https://api.stourify.com/api/v1',
    EXPO_PUBLIC_WEB_URL: 'https://stourify.com',
  })

  expect(legal.TERMS_URL).toBe('https://stourify.com/terms')
  expect(legal.PRIVACY_POLICY_URL).toBe('https://stourify.com/privacy')
  expect(legal.ACCOUNT_DELETION_URL).toBe('https://stourify.com/account-deletion')
})

// The regression this card is about: the API host must not end up in front of
// a reader when a website address is available.
it('never points at the API host once a website is configured', () => {
  const legal = loadLegal({
    EXPO_PUBLIC_API_URL: 'https://api.stourify.com/api/v1',
    EXPO_PUBLIC_WEB_URL: 'https://stourify.com',
  })

  for (const url of [legal.TERMS_URL, legal.PRIVACY_POLICY_URL, legal.ACCOUNT_DELETION_URL]) {
    expect(url).not.toContain('api.stourify.com')
  }
})

/**
 * A build with no separate website — a laptop backend, for instance — still
 * needs working links, and the backend does serve these pages. Falling back is
 * what keeps every dev build's Settings screen functional.
 */
it('falls back to the backend when no website is configured', () => {
  const legal = loadLegal({
    EXPO_PUBLIC_API_URL: 'http://10.0.2.2:8000/api/v1',
    EXPO_PUBLIC_WEB_URL: undefined,
  })

  expect(legal.TERMS_URL).toBe('http://10.0.2.2:8000/terms')
})

it('does not produce a double slash when the website address ends in one', () => {
  const legal = loadLegal({
    EXPO_PUBLIC_API_URL: 'https://api.stourify.com/api/v1',
    EXPO_PUBLIC_WEB_URL: 'https://stourify.com/',
  })

  expect(legal.TERMS_URL).toBe('https://stourify.com/terms')
})

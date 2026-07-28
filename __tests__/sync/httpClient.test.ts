import { splitApiUrl, syncHttpClient, setSyncAuthRejectionHandler, resetSyncAuthGuard, SYNC_TIMEOUT_MS } from '@/sync/httpClient'
import { useAuthStore } from '@/shared/store/auth'

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
}))

const originalFetch = global.fetch

beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({ token: 'tok-abc', user: null })
  resetSyncAuthGuard()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('splitApiUrl', () => {
  it('splits the app API url into a base and an api path', () => {
    expect(splitApiUrl('http://10.0.2.2:8000/api/v1')).toEqual({
      baseUrl: 'http://10.0.2.2:8000',
      apiPath: 'api/v1',
    })
  })

  it('tolerates a trailing slash', () => {
    expect(splitApiUrl('https://stourify.test/api/v1/')).toEqual({
      baseUrl: 'https://stourify.test',
      apiPath: 'api/v1',
    })
  })

  it('falls back to api/v1 when the url carries no version segment', () => {
    expect(splitApiUrl('https://stourify.test')).toEqual({
      baseUrl: 'https://stourify.test',
      apiPath: 'api/v1',
    })
  })
})

describe('the sync client', () => {
  it('is configured with a timeout', () => {
    // React Native's fetch has NO default timeout: a stalled socket would hang
    // forever with no error and no offline signal, holding the sync mutex.
    expect(SYNC_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('sends the one shared bearer token', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ server_time: 'now' }), { status: 200 })),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    await syncHttpClient.get('/stourify/sync/delta')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-abc')
  })

  it('routes a 401 to the registered handler exactly once per guard arming', async () => {
    const onRejection = jest.fn()
    setSyncAuthRejectionHandler(onRejection)

    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ message: 'Unauthenticated.' }), { status: 401 })),
    ) as unknown as typeof fetch

    await expect(syncHttpClient.get('/stourify/sync/delta')).rejects.toThrow()
    await expect(syncHttpClient.get('/stourify/sync/delta')).rejects.toThrow()

    expect(onRejection).toHaveBeenCalledTimes(1)
    expect(onRejection).toHaveBeenCalledWith('unauthenticated')
  })

  it('re-arms the latch so a 401 after a fresh login is not swallowed', async () => {
    const onRejection = jest.fn()
    setSyncAuthRejectionHandler(onRejection)

    global.fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ message: 'Unauthenticated.' }), { status: 401 })),
    ) as unknown as typeof fetch

    await expect(syncHttpClient.get('/stourify/sync/delta')).rejects.toThrow()
    resetSyncAuthGuard()
    await expect(syncHttpClient.get('/stourify/sync/delta')).rejects.toThrow()

    expect(onRejection).toHaveBeenCalledTimes(2)
  })
})

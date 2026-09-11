import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios'

jest.mock('@/shared/config/apiUrl', () => ({ API_URL: 'http://api.test/api/v1' }))
jest.mock('@/shared/store/auth', () => ({
  useAuthStore: { getState: () => ({ token: null }) },
}))

import { client } from '@/shared/api/client'
import { describeRequestFailure } from '@/shared/api/errorMessage'

/**
 * The card this file exists for: STOURIFY-261.
 *
 * On Android a request that runs past the client's 15-second deadline does not
 * come back as a timeout. React Native hands the deadline to OkHttp as a call
 * timeout, OkHttp gives up with `InterruptedIOException("timeout")`, and React
 * Native only recognises the narrower `SocketTimeoutException` — so the failure
 * reaches axios as a plain network error. Logged live on the emulator:
 *
 *   {"url":"/feed","code":"ERR_NETWORK","message":"Network Error",
 *    "hasResponse":false,"timeout":15000,"elapsedMs":15031}
 *
 * The screen then told a person whose connection was fine to check it.
 *
 * These tests drive the real `client` — its real interceptors — through a
 * stand-in adapter that fails the way the Android bridge does. The clock is
 * moved by hand so "ran for sixteen seconds" costs no time at all.
 */

let now = 1_000_000

beforeEach(() => {
  now = 1_000_000
  jest.spyOn(Date, 'now').mockImplementation(() => now)
})

afterEach(() => {
  jest.restoreAllMocks()
})

/** An adapter that takes `ms` of pretend time and then fails with no response. */
function failsWithNoResponseAfter(ms: number, code = AxiosError.ERR_NETWORK): AxiosAdapter {
  return async (config) => {
    now += ms
    throw new AxiosError('Network Error', code, config, {})
  }
}

/** An adapter that takes `ms` of pretend time and then gets a real answer back. */
function answersAfter(ms: number, status: number): AxiosAdapter {
  return async (config) => {
    now += ms
    const response = { status, statusText: '', data: {}, headers: {}, config } as AxiosResponse
    throw new AxiosError('Request failed', String(status), config, {}, response)
  }
}

async function failureOf(promise: Promise<unknown>): Promise<AxiosError> {
  try {
    await promise
  } catch (error) {
    return error as AxiosError
  }
  throw new Error('expected the request to fail')
}

describe('a failure that arrives after our own deadline is a timeout', () => {
  it('is relabelled ETIMEDOUT when there was no response and the deadline had passed', async () => {
    const error = await failureOf(
      client.get('/spots/abc', { adapter: failsWithNoResponseAfter(15_031) }),
    )

    expect(error.code).toBe(AxiosError.ETIMEDOUT)
    expect(error.message).toBe('timeout of 15000ms exceeded')
    // Still no response — the callers that treat "no answer" as "try later"
    // (the media and post drains, the composer) must see exactly what they saw before.
    expect(error.response).toBeUndefined()
  })

  it('counts the deadline itself as reached, to the millisecond', async () => {
    const error = await failureOf(
      client.get('/spots/abc', { adapter: failsWithNoResponseAfter(15_000) }),
    )

    expect(error.code).toBe(AxiosError.ETIMEDOUT)
  })

  it('uses the deadline the request was actually given, not a fixed 15 seconds', async () => {
    const error = await failureOf(
      client.get('/spots/abc', { timeout: 60_000, adapter: failsWithNoResponseAfter(20_000) }),
    )

    expect(error.code).toBe(AxiosError.ERR_NETWORK)
  })

  /**
   * The whole card in one assertion: a slow server is never described as the
   * reader's connection.
   */
  it('reaches the screen as "took too long", never "check your connection"', async () => {
    const error = await failureOf(
      client.get('/spots/abc', { adapter: failsWithNoResponseAfter(15_031) }),
    )

    const { icon, subtitle } = describeRequestFailure(error, 'this spot')

    expect(subtitle).toContain('took too long')
    expect(subtitle).not.toMatch(/check your connection/i)
    expect(icon).toBe('🐢')
  })
})

describe('everything else passes through untouched', () => {
  /**
   * The true case the old wording was always right about. Airplane mode, an
   * unreachable host: the phone gives up at once, long before any deadline.
   */
  it('keeps a fast network failure as ERR_NETWORK, so it still says to check the connection', async () => {
    const error = await failureOf(
      client.get('/spots/abc', { adapter: failsWithNoResponseAfter(40) }),
    )

    expect(error.code).toBe(AxiosError.ERR_NETWORK)
    expect(describeRequestFailure(error, 'this spot').subtitle).toMatch(/check your connection/i)
  })

  it('leaves a request with no deadline alone, however long it ran', async () => {
    const error = await failureOf(
      client.get('/spots/abc', { timeout: 0, adapter: failsWithNoResponseAfter(120_000) }),
    )

    expect(error.code).toBe(AxiosError.ERR_NETWORK)
  })

  it.each([401, 403, 404, 429, 503])(
    'never relabels a slow %d — the server answered, and the answer is the story',
    async (status) => {
      const error = await failureOf(
        client.get('/spots/abc', { adapter: answersAfter(16_000, status) }),
      )

      expect(error.code).toBe(String(status))
      expect(error.response?.status).toBe(status)
    },
  )
})

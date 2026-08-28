import { AxiosError, type AxiosResponse } from 'axios'
import { describeRequestFailure } from '@/shared/api/errorMessage'

/**
 * The card this file exists for: STOURIFY-225.
 *
 * A user on a perfectly good network was told "We couldn't reach Stourify just
 * now. Check your connection and try again." The server had answered — it said
 * `403`. The app was holding that answer the whole time and never looked at it.
 *
 * So every test below is the same shape: build the error axios would really
 * hand a screen, and assert the screen is given words that match what actually
 * happened. Real `AxiosError` objects rather than hand-rolled look-alikes, on
 * purpose — a fake error can be shaped to pass whatever the code under test
 * happens to read, which tests the fixture and not the app.
 */

function responseError(status: number, data: unknown = {}): AxiosError {
  const config = { headers: {} } as never
  const response = {
    status,
    statusText: '',
    data,
    headers: {},
    config,
  } as AxiosResponse

  return new AxiosError('Request failed', String(status), config, {}, response)
}

function networkError(): AxiosError {
  return new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never, {})
}

function timeoutError(): AxiosError {
  return new AxiosError(
    'timeout of 15000ms exceeded',
    AxiosError.ECONNABORTED,
    { headers: {} } as never,
    {},
  )
}

describe('the title names the thing that would not load, whatever went wrong', () => {
  it.each([
    ['a refusal', responseError(403)],
    ['a server fault', responseError(500)],
    ['a dead network', networkError()],
    ['a deadline', timeoutError()],
    ['something that is not an axios error at all', new Error('boom')],
  ])('says "Couldn\'t load your feed" for %s', (_label, error) => {
    expect(describeRequestFailure(error, 'your feed').title).toBe("Couldn't load your feed")
  })

  it('names whatever subject it is given', () => {
    expect(describeRequestFailure(networkError(), 'this profile').title).toBe(
      "Couldn't load this profile",
    )
  })
})

describe('what the user is told', () => {
  /**
   * The one case the original wording was always right about, kept word for
   * word. A fix that quietly reworded the true case would be trading one
   * inaccuracy for another.
   */
  it('still blames the connection when there was genuinely no answer', () => {
    const { subtitle } = describeRequestFailure(networkError(), 'your feed')

    expect(subtitle).toContain('check your connection')
    expect(subtitle).toContain("couldn't reach Stourify")
  })

  it('says the server was slow, not absent, when the deadline ran out', () => {
    const { subtitle } = describeRequestFailure(timeoutError(), 'your feed')

    expect(subtitle).toContain('took too long')
    expect(subtitle).not.toContain('check your connection')
  })

  /**
   * The measured case. `403` is the server saying no to a request that reached
   * it perfectly well, so nothing about the connection may appear here.
   */
  it('says it is a permission problem on a 403, and never mentions the connection', () => {
    const { subtitle } = describeRequestFailure(responseError(403), 'your feed')

    expect(subtitle).toContain("isn't allowed")
    expect(subtitle).not.toContain('connection')
  })

  it('says the session ended on a 401', () => {
    const { subtitle } = describeRequestFailure(responseError(401), 'your feed')

    expect(subtitle).toContain('signed in again')
    expect(subtitle).not.toContain('connection')
  })

  it('says it could not be found on a 404', () => {
    const { subtitle } = describeRequestFailure(responseError(404), 'your feed')

    expect(subtitle).toContain("couldn't find")
    expect(subtitle).not.toContain('connection')
  })

  it('says to slow down on a 429', () => {
    const { subtitle } = describeRequestFailure(responseError(429), 'your feed')

    expect(subtitle).toContain('too quickly')
    expect(subtitle).not.toContain('connection')
  })

  it.each([500, 502, 503])('blames Stourify, not the reader, on a %d', (status) => {
    const { subtitle } = describeRequestFailure(responseError(status), 'your feed')

    expect(subtitle).toContain("Stourify's end")
    expect(subtitle).not.toContain('check your connection')
  })

  it('falls back to something honest for a status nobody planned for', () => {
    const { subtitle } = describeRequestFailure(responseError(418), 'your feed')

    expect(subtitle).toContain('Something went wrong')
    expect(subtitle).not.toContain('connection')
  })

  it('falls back to something honest for an error that is not from axios', () => {
    const { subtitle } = describeRequestFailure(new Error('boom'), 'your feed')

    expect(subtitle).toContain('Something went wrong')
  })
})

describe('the icon', () => {
  it('is the signal icon only when the connection really is the story', () => {
    expect(describeRequestFailure(networkError(), 'your feed').icon).toBe('📡')
    expect(describeRequestFailure(responseError(403), 'your feed').icon).not.toBe('📡')
    expect(describeRequestFailure(responseError(500), 'your feed').icon).not.toBe('📡')
  })
})

/**
 * Two failures that are different facts must not produce the same screen. This
 * is the property the whole card is about, stated once rather than left implied
 * by a dozen individual assertions: a reader who sees the same sentence for a
 * refusal and for a dead radio has learned nothing from either.
 */
it('never gives two different failures the same words', () => {
  const cases = [
    networkError(),
    timeoutError(),
    responseError(401),
    responseError(403),
    responseError(404),
    responseError(429),
    responseError(500),
  ]

  const subtitles = cases.map((error) => describeRequestFailure(error, 'your feed').subtitle)

  expect(new Set(subtitles).size).toBe(cases.length)
})

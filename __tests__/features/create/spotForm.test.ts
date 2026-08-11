import { MAX_SPOT_CATEGORIES, validateSpotForm } from '@/features/create/api/spotForm'

/**
 * These rules exist to mirror the server's, so the tests are written as the
 * server's boundaries rather than as the screen's copy.
 *
 * `modules/Stourify/src/Http/Requests/SpotStoreRequest.php`:
 *   title       required, string, min:3, max:255
 *   description nullable, string, max:5000
 *   latitude    required, numeric, between:-90,90
 *   longitude   required, numeric, between:-180,180
 *   categories  nullable, array, max:10; each string, max:40
 *
 * Why bother client-side at all, when the server validates anyway: a spot is
 * written to the local database first and pushed later, so a shape the server
 * refuses fails minutes after the person who typed it has walked away. The
 * queue is the reason, not distrust of the server.
 */

const VALID = {
  title: 'Hidden Cove',
  description: 'Worth the climb.',
  coordinate: { latitude: 6.1164, longitude: 125.1716 },
  categories: ['Coast'],
}

describe('validateSpotForm — the title', () => {
  it('accepts a filled-in form', () => {
    expect(validateSpotForm(VALID)).toBeNull()
  })

  it('refuses a title of two characters and accepts one of three', () => {
    expect(validateSpotForm({ ...VALID, title: 'La' })).toMatch(/3 characters/)
    expect(validateSpotForm({ ...VALID, title: 'Lae' })).toBeNull()
  })

  it('ignores surrounding spaces when measuring it', () => {
    expect(validateSpotForm({ ...VALID, title: '  La  ' })).toMatch(/3 characters/)
  })

  it('refuses 256 characters and accepts 255', () => {
    expect(validateSpotForm({ ...VALID, title: 'x'.repeat(256) })).toMatch(/255/)
    expect(validateSpotForm({ ...VALID, title: 'x'.repeat(255) })).toBeNull()
  })
})

describe('validateSpotForm — the description', () => {
  it('is optional', () => {
    expect(validateSpotForm({ ...VALID, description: '' })).toBeNull()
  })

  it('refuses 5001 characters and accepts 5000', () => {
    expect(validateSpotForm({ ...VALID, description: 'x'.repeat(5001) })).toMatch(/5,000/)
    expect(validateSpotForm({ ...VALID, description: 'x'.repeat(5000) })).toBeNull()
  })
})

describe('validateSpotForm — the location', () => {
  // The screen has no coordinate fields to type into, so "no location yet" is
  // the only way this can fail in practice — and it has to say something a
  // person can act on rather than naming a latitude.
  it('refuses a form with no position picked yet', () => {
    expect(validateSpotForm({ ...VALID, coordinate: null })).toMatch(/location/i)
  })

  it('refuses a position off the earth, which is what a broken engine event looks like', () => {
    expect(
      validateSpotForm({ ...VALID, coordinate: { latitude: 91, longitude: 0 } }),
    ).toMatch(/-90/)
    expect(
      validateSpotForm({ ...VALID, coordinate: { latitude: 0, longitude: 181 } }),
    ).toMatch(/-180/)
    expect(
      validateSpotForm({ ...VALID, coordinate: { latitude: Number.NaN, longitude: 0 } }),
    ).not.toBeNull()
  })

  it('accepts the extremes themselves', () => {
    expect(validateSpotForm({ ...VALID, coordinate: { latitude: -90, longitude: 180 } })).toBeNull()
  })
})

describe('validateSpotForm — the categories', () => {
  it('are optional', () => {
    expect(validateSpotForm({ ...VALID, categories: [] })).toBeNull()
  })

  it(`refuses more than ${MAX_SPOT_CATEGORIES}`, () => {
    const tooMany = Array.from({ length: MAX_SPOT_CATEGORIES + 1 }, (_, i) => `c${i}`)

    expect(validateSpotForm({ ...VALID, categories: tooMany })).toMatch(
      new RegExp(String(MAX_SPOT_CATEGORIES)),
    )
    expect(validateSpotForm({ ...VALID, categories: tooMany.slice(0, MAX_SPOT_CATEGORIES) })).toBeNull()
  })

  it('refuses a category of 41 characters and accepts one of 40', () => {
    expect(validateSpotForm({ ...VALID, categories: ['x'.repeat(41)] })).toMatch(/40/)
    expect(validateSpotForm({ ...VALID, categories: ['x'.repeat(40)] })).toBeNull()
  })
})

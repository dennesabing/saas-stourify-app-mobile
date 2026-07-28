import delta from './fixtures/m2a-delta.json'
import pushResponse from './fixtures/m2a-push-response.json'

const SYNCED_TABLES = [
  'sto_spots',
  'sto_reviews',
  'sto_wishlist_items',
  'sto_follows',
  'sto_explorer_profiles',
  'sto_cities',
]

describe('the captured M2a delta fixture', () => {
  it('is the top-level payload, not wrapped in a data envelope', () => {
    expect((delta as Record<string, unknown>).data).toBeUndefined()
    expect(typeof (delta as Record<string, unknown>).server_time).toBe('string')
  })

  it('carries a bucket for every synced table', () => {
    for (const table of SYNCED_TABLES) {
      const bucket = (delta as Record<string, any>)[table]
      expect(bucket).toBeDefined()
      expect(Array.isArray(bucket.created)).toBe(true)
      expect(Array.isArray(bucket.updated)).toBe(true)
      expect(Array.isArray(bucket.deleted)).toBe(true)
    }
  })

  it('emits a numeric id on at least one row, which is what becomes server_id', () => {
    const rows = (delta as Record<string, any>).sto_cities.created
    expect(rows.length).toBeGreaterThan(0)
    expect(typeof rows[0].id).toBe('number')
    expect(typeof rows[0].uuid).toBe('string')
  })
})

describe('the captured M2a push-response fixture', () => {
  it('IS wrapped in a data envelope, unlike the delta', () => {
    expect((pushResponse as Record<string, any>).data).toBeDefined()
    expect(typeof (pushResponse as Record<string, any>).data.server_time).toBe('string')
  })

  it('carries one result per operation, with the contract keys', () => {
    const results = (pushResponse as Record<string, any>).data.results
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toEqual(
      expect.objectContaining({
        table: expect.any(String),
        uuid: expect.any(String),
        op: expect.any(String),
        status: expect.any(String),
      }),
    )
  })

  it('returns the server-canonical record on an ok result', () => {
    const results = (pushResponse as Record<string, any>).data.results
    const ok = results.find((r: any) => r.status === 'ok' && r.op !== 'deleted')
    expect(ok).toBeDefined()
    expect(typeof ok.record.slug).toBe('string')
    expect(typeof ok.record.id).toBe('number')
  })
})

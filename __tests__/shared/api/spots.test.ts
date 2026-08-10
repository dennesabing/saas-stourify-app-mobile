const mockClientGet = jest.fn()
const mockClientPost = jest.fn()

jest.mock('@/shared/api/client', () => ({
  client: {
    get: (...args: unknown[]) => mockClientGet(...args),
    post: (...args: unknown[]) => mockClientPost(...args),
  },
}))

import { createSpot } from '@/shared/api/spots'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('createSpot', () => {
  /**
   * `title` is the server's field name (`SpotStoreRequest`), not `name`.
   *
   * This posted `name` until STOURIFY-2, and because Laravel silently drops
   * unvalidated keys the spot would have been created with no title at all —
   * or, since `title` is `required`, rejected with a 422 naming a field the
   * client never sent. Nothing called `createSpot` yet, so the trap was
   * dormant rather than absent.
   */
  it('POSTs `title`, the field SpotStoreRequest actually validates', async () => {
    mockClientPost.mockResolvedValueOnce({
      data: { data: { uuid: 'spot-uuid-1', title: 'Hidden Cove' }, message: 'ok' },
    })

    const spot = await createSpot({
      title: 'Hidden Cove',
      latitude: 6.1164,
      longitude: 125.1716,
      description: 'A quiet cove past the last barangay road.',
    })

    expect(mockClientPost).toHaveBeenCalledWith('/spots', {
      title: 'Hidden Cove',
      latitude: 6.1164,
      longitude: 125.1716,
      description: 'A quiet cove past the last barangay road.',
    })
    expect(spot.uuid).toBe('spot-uuid-1')
  })

  it('never sends a `name` key — the server has no rule for it and would drop it silently', async () => {
    mockClientPost.mockResolvedValueOnce({ data: { data: { uuid: 'spot-uuid-2' }, message: 'ok' } })

    await createSpot({ title: 'Kalaklan Point', latitude: 6.2, longitude: 125.2 })

    const [, body] = mockClientPost.mock.calls[0]
    expect(body).not.toHaveProperty('name')
    expect(body).toEqual({ title: 'Kalaklan Point', latitude: 6.2, longitude: 125.2 })
  })
})

import { syncTrace } from '@/sync/trace'

/**
 * The trace is a tracker stuck on a parcel: it must report where the parcel got
 * to, and it must not be stuck on every parcel the company ever ships. So the
 * only thing worth asserting about it is that the switch works in BOTH
 * directions — a switch that is always on is not a switch, and one that is
 * always off is not an instrument.
 */
describe('the sync trace switch', () => {
  const original = process.env.EXPO_PUBLIC_SYNC_TRACE
  let spy: jest.SpyInstance

  beforeEach(() => {
    spy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    spy.mockRestore()
    if (original === undefined) delete process.env.EXPO_PUBLIC_SYNC_TRACE
    else process.env.EXPO_PUBLIC_SYNC_TRACE = original
  })

  it('writes nothing at all when the flag is unset', () => {
    delete process.env.EXPO_PUBLIC_SYNC_TRACE

    syncTrace('cycle#1 enter trigger=connectivity')

    expect(spy).not.toHaveBeenCalled()
  })

  it('writes nothing when the flag is set to anything other than 1', () => {
    process.env.EXPO_PUBLIC_SYNC_TRACE = 'true'

    syncTrace('cycle#1 enter trigger=connectivity')

    expect(spy).not.toHaveBeenCalled()
  })

  it('writes one tagged, timestamped line when the flag is on', () => {
    process.env.EXPO_PUBLIC_SYNC_TRACE = '1'

    syncTrace('cycle#1 enter trigger=connectivity')

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toMatch(
      /^S220 \d{2}:\d{2}:\d{2}\.\d{3} cycle#1 enter trigger=connectivity$/,
    )
  })
})

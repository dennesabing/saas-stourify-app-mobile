import { formatSignOutRecord, recordSignOut } from '@/sync/signOutRecord'

const AT = new Date('2026-08-28T09:41:02.123Z')

describe('formatSignOutRecord', () => {
  it('names the request that caused an automatic sign-out, and what was about to be lost', () => {
    const line = formatSignOutRecord(
      {
        trigger: 'sync-client-rejected',
        detail: {
          status: 401,
          method: 'GET',
          path: '/stourify/sync/delta',
          credentialSent: false,
        },
      },
      { pendingCount: 3, pendingMediaCount: 1 },
      AT,
    )

    expect(line).toBe(
      'S214 09:41:02.123 signOut trigger=sync-client-rejected status=401 method=GET ' +
        'path=/stourify/sync/delta credentialSent=false unsentRows=3 unsentPhotos=1',
    )
  })

  it('writes a dash where there was no response, so a user logout still reads as one line', () => {
    const line = formatSignOutRecord(
      { trigger: 'user-logout' },
      { pendingCount: 0, pendingMediaCount: 0 },
      AT,
    )

    expect(line).toBe(
      'S214 09:41:02.123 signOut trigger=user-logout status=- method=- path=- ' +
        'credentialSent=- unsentRows=0 unsentPhotos=0',
    )
  })
})

describe('recordSignOut', () => {
  /**
   * The whole point of this record is that it is there without anybody having
   * switched it on. The sign-out it exists to explain has been seen exactly
   * once, unannounced, on a phone nobody was watching — so a record you have to
   * arm in advance is a record you will not have.
   */
  it('writes the line without any diagnostic flag being set', () => {
    const previous = process.env.EXPO_PUBLIC_SYNC_TRACE
    delete process.env.EXPO_PUBLIC_SYNC_TRACE

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {})
    try {
      recordSignOut({ trigger: 'api-client-rejected' }, { pendingCount: 0, pendingMediaCount: 0 })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toContain('signOut trigger=api-client-rejected')
    } finally {
      spy.mockRestore()
      if (previous !== undefined) process.env.EXPO_PUBLIC_SYNC_TRACE = previous
    }
  })
})

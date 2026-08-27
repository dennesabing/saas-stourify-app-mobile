import { render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import * as minimumVersion from '@/shared/update/minimumVersion'
import { useMinimumVersion } from '@/shared/update/useMinimumVersion'

/**
 * The launch-time wiring. Two properties matter and neither is about the
 * comparison itself — that is `minimumVersion.test.ts`'s subject.
 *
 * First, the check must not hold the launch open: a person opening the app on a
 * train should see the app, not a spinner waiting on a CDN.
 *
 * Second, a development build must not run it at all. A build on somebody's
 * laptop is deliberately older than whatever is published, so gating it would
 * make this the first thing anybody deletes.
 */
function Probe() {
  const state = useMinimumVersion()

  return <Text testID="state">{state.supported ? 'supported' : 'blocked'}</Text>
}

describe('useMinimumVersion', () => {
  const ORIGINAL_DEV = (globalThis as { __DEV__?: boolean }).__DEV__

  afterEach(() => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = ORIGINAL_DEV
    jest.restoreAllMocks()
  })

  it('starts out letting the app run, before any answer has arrived', () => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
    jest.spyOn(minimumVersion, 'fetchMinimumVersion').mockReturnValue(new Promise(() => {}))

    render(<Probe />)

    expect(screen.getByTestId('state').props.children).toBe('supported')
  })

  it('blocks once an answer says the build is too old', async () => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
    jest.spyOn(minimumVersion, 'fetchMinimumVersion').mockResolvedValue({
      supported: false,
      message: null,
      downloadUrl: 'https://cdn.example/2.0.0.apk',
      latestVersion: '2.0.0',
    })

    render(<Probe />)

    await waitFor(() => expect(screen.getByTestId('state').props.children).toBe('blocked'))
  })

  it('does not check at all in a development build', async () => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = true
    const check = jest.spyOn(minimumVersion, 'fetchMinimumVersion')

    render(<Probe />)

    await waitFor(() => expect(screen.getByTestId('state').props.children).toBe('supported'))
    expect(check).not.toHaveBeenCalled()
  })
})

import { useEffect, useState } from 'react'
import {
  APP_VERSION_CODE,
  RELEASE_MANIFEST_TIMEOUT_MS,
  RELEASE_MANIFEST_URL,
} from '@/shared/config/release'
import type { MinimumVersionResult } from './minimumVersion'

// A namespace import, deliberately: it keeps the call going through the module
// boundary at run time, which is what lets a test replace the check without
// having to replace this hook as well.
import * as minimumVersion from './minimumVersion'

const SUPPORTED: MinimumVersionResult = { supported: true }

/**
 * Ask once, at launch, whether this build is still allowed to run.
 *
 * Two things about the shape of this hook are deliberate.
 *
 * **It starts out permissive and only ever gets stricter.** The first render
 * says "supported", and a blocking answer arrives later if it arrives at all.
 * The alternative — hold the app on a spinner until the CDN answers — puts a
 * network round trip in front of every single launch, including the ones with
 * no network, which is a worse app for everybody in order to catch a case that
 * is rare by construction.
 *
 * **A development build is never checked.** A build on somebody's laptop is
 * deliberately older than whatever is published, so gating it would make this
 * the first thing anybody rips out. It costs nothing in coverage: the artifact
 * that reaches a real person is never a development build. `__DEV__` is false
 * for the whole release family, including the `releaseDev` build this project's
 * offline tests install, so the gate can still be exercised on an emulator.
 */
export function useMinimumVersion(): MinimumVersionResult {
  const [result, setResult] = useState<MinimumVersionResult>(SUPPORTED)

  useEffect(() => {
    if (__DEV__) return

    let cancelled = false

    void minimumVersion
      .fetchMinimumVersion({
        url: RELEASE_MANIFEST_URL,
        versionCode: APP_VERSION_CODE,
        timeoutMs: RELEASE_MANIFEST_TIMEOUT_MS,
      })
      .then((answer) => {
        if (!cancelled) setResult(answer)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return result
}

/**
 * Deciding whether this build is still allowed to run.
 *
 * The release channel publishes a `manifest.json` listing every build it has
 * ever shipped, plus one number — `min_version_code` — meaning *the oldest
 * build still permitted here*. That number is drawn after those builds shipped,
 * which is why it lives on the channel rather than inside any app: a build
 * compiled in June cannot know that August's change makes it unsafe.
 *
 * ## The rule that governs every branch below
 *
 * **Silence never blocks.** The app stops itself only when it has actually read
 * a manifest and that manifest names a number higher than its own. A file it
 * could not reach, a slow one, a 403, a body that is not the JSON we expected,
 * or a manifest with no floor in it — every one of those lets the app run.
 *
 * The asymmetry is the whole safety property. Blocking on doubt would turn a
 * bad minute at the CDN into an outage on every phone at once, and it would
 * fire for anyone who opened the app with no signal. It also matches the rule
 * the backend already applies to the same field: an absent value reads as `0`,
 * never as a force.
 */

/** One published build, as the release manifest spells it. */
export interface ReleaseManifestVersion {
  version?: string
  version_code?: number
  /** A CDN address for the APK — deliberately not a link to any Stourify host. */
  apk_url?: string | null
}

/** The published release manifest, as far as this check cares about it. */
export interface ReleaseManifest {
  latest?: string | null
  versions?: ReleaseManifestVersion[]
  /** Oldest build code this channel still permits. Absent or `0` means none. */
  min_version_code?: number
  /** What to tell somebody below the floor. Absent means use our own wording. */
  update_message?: string | null
}

/** This build may run. */
export interface Supported {
  supported: true
}

/** This build may not run, and here is everything the screen needs to say so. */
export interface Unsupported {
  supported: false
  /** The channel's own wording, when it published one. */
  message: string | null
  /** Where to get a build that works, or `null` if the manifest offered none. */
  downloadUrl: string | null
  /** The newest published version, so the screen can name it. */
  latestVersion: string | null
}

export type MinimumVersionResult = Supported | Unsupported

const SUPPORTED: Supported = { supported: true }

/**
 * Compare a manifest against one build's version code.
 *
 * Pure, and separate from the fetch on purpose: this is the part with all the
 * edge cases in it, and it is worth being able to test without a network at all.
 */
export function evaluateManifest(
  manifest: ReleaseManifest,
  versionCode: number,
): MinimumVersionResult {
  const floor = manifest.min_version_code

  // `typeof` rather than a truthiness check: a manifest carrying a string, a
  // null or nothing at all is a manifest that has said nothing about a floor.
  if (typeof floor !== 'number' || !Number.isFinite(floor) || floor <= 0) return SUPPORTED

  // The floor is the oldest build still PERMITTED, so equality passes.
  if (versionCode >= floor) return SUPPORTED

  const versions = Array.isArray(manifest.versions) ? manifest.versions : []
  const latestVersion = manifest.latest ?? versions[0]?.version ?? null

  // Prefer the row `latest` names. The publisher sorts newest-first so the
  // first row is usually the same thing, but "usually" is not a reason to read
  // a different field than the one that states the answer.
  const latestRow = versions.find((v) => v.version === latestVersion) ?? versions[0]

  return {
    supported: false,
    message: manifest.update_message ?? null,
    downloadUrl: latestRow?.apk_url ?? null,
    latestVersion,
  }
}

interface FetchOptions {
  url: string
  versionCode: number
  timeoutMs?: number
  /** Injected so tests never touch the network. Defaults to the real `fetch`. */
  fetchImpl?: typeof fetch
}

/**
 * Read the manifest and decide. Never throws, and never blocks on doubt.
 */
export async function fetchMinimumVersion({
  url,
  versionCode,
  timeoutMs = 6000,
  fetchImpl = fetch,
}: FetchOptions): Promise<MinimumVersionResult> {
  if (!url) return SUPPORTED

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      // The floor changes without an app release, so a cached copy would defeat
      // the point of it being changeable at all.
      cache: 'no-store',
    })

    if (!response.ok) return SUPPORTED

    const body = (await response.json()) as unknown

    if (!body || typeof body !== 'object') return SUPPORTED

    return evaluateManifest(body as ReleaseManifest, versionCode)
  } catch {
    // Unreachable, aborted, or unparseable. All of them are the app saying "I
    // do not know", and not knowing is not a reason to stop.
    return SUPPORTED
  } finally {
    clearTimeout(timer)
  }
}

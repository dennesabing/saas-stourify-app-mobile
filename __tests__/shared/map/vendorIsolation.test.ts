import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

/**
 * The map vendor is allowed to exist in exactly one file.
 *
 * `react-native-maps` is swapped for MapLibre post-beta (offline map packs are
 * the flagship Pro feature). That swap is a one-file change only for as long as
 * one file knows the vendor exists, and a convention nobody checks does not
 * survive three milestones — so this is a test rather than a note in a doc.
 *
 * `mobile/` ships no ESLint install or config, so `no-restricted-imports` — the
 * canonical tool for this — would mean adding a linter and its CI wiring, a
 * larger change than the rule it enforces. A jest test runs in the channel
 * matrix that already gates every card.
 */

const VENDOR = 'react-native-maps'

/** Repo-relative, POSIX-spelled. The one file permitted to name the vendor. */
const WRAPPER = 'src/shared/map/MapCanvas.tsx'

const SRC = join(__dirname, '..', '..', '..', 'src')

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full))
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full)
    }
  }
  return found
}

function filesNamingVendor(): string[] {
  return sourceFiles(SRC)
    .filter((file) => readFileSync(file, 'utf8').includes(VENDOR))
    .map((file) => relative(join(SRC, '..'), file).split(sep).join('/'))
    .sort()
}

describe(`the ${VENDOR} boundary`, () => {
  it('is named by exactly one file in src/', () => {
    expect(filesNamingVendor()).toEqual([WRAPPER])
  })

  it('has that file actually present — a deleted wrapper must fail, not vacuously pass', () => {
    // Without this, renaming the wrapper away leaves an empty match set, and an
    // empty set trivially satisfies "nothing outside the wrapper imports it".
    expect(sourceFiles(SRC).map((f) => relative(join(SRC, '..'), f).split(sep).join('/'))).toContain(
      WRAPPER,
    )
  })

  it('walks a source tree it actually found — an empty walk is a broken test, not a pass', () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(20)
  })
})

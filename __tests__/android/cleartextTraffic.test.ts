/**
 * Guards the one property this project cannot check by looking at the app:
 * the build that goes to Play must still refuse plain, unencrypted HTTP.
 *
 * Android bolts that door shut by default for any app targeting API 28 or later.
 * Development builds prop it open on purpose, because the only backend the test
 * rig is allowed to drive is a plain `php artisan serve` on the developer's own
 * machine (docs/testing/which-backend-the-app-is-tested-against.md). The danger
 * is that the quickest way to prop it open — one attribute on the MAIN manifest —
 * props it open for every user of the shipped app, forever.
 *
 * So the rule is: the opening lives only in a source set that the Play build does
 * not use. These assertions are what stop somebody moving it (STOURIFY-117).
 *
 * This reads the build's SOURCE. It cannot see what the manifest merger produced,
 * which is a different and stronger check — that one is a command a reviewer runs
 * against a real build, and it is written up in
 * mobile/docs/building-a-dev-release-apk.md.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const androidApp = join(__dirname, '..', '..', 'android', 'app');
const read = (...parts: string[]) => readFileSync(join(androidApp, ...parts), 'utf8');

describe('the shipped Android build stays locked down', () => {
  it('never opens cleartext traffic on the main manifest', () => {
    const main = read('src', 'main', 'AndroidManifest.xml');

    expect(main).not.toContain('usesCleartextTraffic');
    expect(main).not.toContain('networkSecurityConfig');
  });

  it('has no release source set that could reopen it', () => {
    // A src/release/AndroidManifest.xml would be merged into the Play artifact.
    // Nothing needs one today; if one ever appears, it must not carry the opening.
    let releaseManifest: string | null = null;
    try {
      releaseManifest = read('src', 'release', 'AndroidManifest.xml');
    } catch {
      releaseManifest = null;
    }

    if (releaseManifest !== null) {
      expect(releaseManifest).not.toContain('usesCleartextTraffic');
      expect(releaseManifest).not.toContain('networkSecurityConfig');
    }
  });
});

describe('the releaseDev build type is the one that may talk plain HTTP', () => {
  it('carries the opening in its own source set', () => {
    const releaseDev = read('src', 'releaseDev', 'AndroidManifest.xml');

    expect(releaseDev).toContain('android:usesCleartextTraffic="true"');
  });

  it('is declared in build.gradle and copies release rather than debug', () => {
    const gradle = read('build.gradle');

    expect(gradle).toMatch(/releaseDev\s*\{/);
    expect(gradle).toMatch(/initWith\s+release/);
    // Every Expo/React Native library module publishes only debug and release
    // variants. Without this, Gradle cannot resolve a single dependency for a
    // third build type and the build fails before it compiles anything.
    expect(gradle).toMatch(/matchingFallbacks\s*=\s*\[\s*['"]release['"]\s*\]/);
  });
});

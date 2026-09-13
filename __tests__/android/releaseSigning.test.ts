/**
 * Guards WHICH SEAL each Android build is signed with (STOURIFY-300).
 *
 * An APK's signature works like a wax seal on a letter: a phone accepts an update
 * only when the new copy carries the same seal as the one already installed. Until
 * this card the public production APK was sealed with Android's debug key — a key
 * every developer machine generates and whose details are public — so anybody could
 * forge an "update" that a user's phone would accept.
 *
 * Three facts decide the shape asserted below:
 *
 *   - Only a PRODUCTION release reaches users, so only it moves to the private key.
 *   - The rig installs `debug` over `releaseDev` with `adb install -r` (root app.json
 *     → bundlerAttach.buildCommandsNote). That works only while both carry ONE seal,
 *     so both stay on the debug key — `releaseDev` explicitly, because `initWith
 *     release` would otherwise hand it the private key.
 *   - A production build with no private key must refuse rather than quietly fall
 *     back to the debug seal, which is how the public APK got its seal in the first
 *     place.
 *
 * Like its neighbours, this reads the build's SOURCE and cannot see a real build. The
 * stronger check reads the finished APK's certificate with `apksigner`, inside
 * scripts/mobile-apk-builder.ps1; docs/mobile-apk-build.md → Signing says how to run
 * it by hand.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const appDir = join(__dirname, '..', '..', 'android', 'app');
const gradle = readFileSync(join(appDir, 'build.gradle'), 'utf8');

// Comments here legitimately discuss every name below, so they are stripped before
// looking. Carriage returns first: see apiUrlGuard.test.ts for why that order matters.
const code = gradle
  .replace(/\r/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
  .join('\n');

// The text of one `name { … }` block, found by counting braces rather than by a
// regular expression, because these blocks nest.
function block(source: string, opener: RegExp): string {
  const match = opener.exec(source);
  if (!match) return '';
  let depth = 0;
  for (let i = match.index + match[0].length - 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) {
      return source.slice(match.index, i + 1);
    }
  }
  return '';
}

const buildTypes = block(code, /buildTypes\s*\{/);
const releaseType = block(buildTypes, /\brelease\s*\{/);
const releaseDevType = block(buildTypes, /\breleaseDev\s*\{/);
const debugType = block(buildTypes, /\bdebug\s*\{/);

describe('the production release is sealed with a private Stourify key', () => {
  it('reads the key from the environment, never from a tracked file', () => {
    for (const name of [
      'STOURIFY_RELEASE_KEYSTORE',
      'STOURIFY_RELEASE_STORE_PASSWORD',
      'STOURIFY_RELEASE_KEY_PASSWORD',
    ]) {
      expect(code).toMatch(
        new RegExp(`System\\.getenv\\(\\s*["']${name}["']\\s*\\)`),
      );
    }
  });

  it('carries no password in the file except the public debug one', () => {
    // The debug keystore's password is `android` on every machine in the world;
    // that is the whole problem with it. Any other literal here is a leaked secret.
    const literals = [
      ...code.matchAll(/(?:storePassword|keyPassword)\s+['"]([^'"]*)['"]/g),
    ].map((m) => m[1]);
    expect(literals.length).toBeGreaterThan(0);
    expect(literals.every((value) => value === 'android')).toBe(true);
  });

  it('declares a release signing config beside the debug one', () => {
    expect(block(code, /signingConfigs\s*\{/)).toMatch(/\brelease\s*\{/);
  });

  it('signs the release build type with it, not with the debug key', () => {
    expect(releaseType).not.toBe('');
    expect(releaseType).toMatch(/signingConfig\s+[^\n]*signingConfigs\.release/);
    // The scaffold default, and the bug: a bare debug seal on the release type.
    expect(releaseType).not.toMatch(/signingConfig\s+signingConfigs\.debug\s*$/m);
  });

  it('keeps the dev-channel release build on the debug key', () => {
    // `mobile-apk-builder.ps1 -Target dev` builds `release` with
    // -PstourifyReleaseTier=dev for the private dev channel. It stays debug-signed
    // so a dev build can never pass as an update to a real user's install.
    expect(code).toMatch(
      /releaseTierName\s*!=\s*["']dev["'][\s\S]{0,200}?stourifyReleaseSigning|stourifyReleaseSigning[\s\S]{0,200}?releaseTierName\s*!=\s*["']dev["']/,
    );
  });
});

describe('…and the rig keeps the one seal it depends on', () => {
  it('signs releaseDev with the debug key explicitly, after inheriting from release', () => {
    expect(releaseDevType).not.toBe('');
    expect(releaseDevType).toMatch(
      /initWith\s+release[\s\S]*signingConfig\s+signingConfigs\.debug/,
    );
  });

  it('leaves the debug build on the debug key', () => {
    expect(debugType).toMatch(/signingConfig\s+signingConfigs\.debug/);
  });

  it('never deletes or replaces the checked-in debug keystore', () => {
    expect(code).toMatch(/storeFile\s+file\(\s*['"]debug\.keystore['"]\s*\)/);
  });
});

describe('…and a production release with no private key refuses', () => {
  it('has a refusal, and it spares the dev tier', () => {
    const refusal = block(code, /def\s+assertReleaseSigningIsPrivate\s*=\s*\{/);
    expect(refusal).not.toBe('');
    expect(refusal).toMatch(/releaseTierName\s*==\s*["']dev["']/);
    expect(refusal).toContain('GradleException');
    // The refusal says which variables to set, by name.
    expect(refusal).toContain('STOURIFY_RELEASE_KEYSTORE');
  });

  it('refuses before compiling, from the task graph', () => {
    expect(code).toMatch(
      /taskGraph\.whenReady[\s\S]{0,300}?releaseAnchorPaths[\s\S]{0,300}?assertReleaseSigningIsPrivate/,
    );
  });

  it('refuses at the task that actually signs the APK', () => {
    // The graph check is about speed. This one is why the answer is right: nothing
    // produces a signed release APK without running packageRelease.
    expect(code).toMatch(
      /task\.name\s*==\s*["']packageRelease["'][\s\S]{0,300}?assertReleaseSigningIsPrivate/,
    );
  });

  it('never prints a password', () => {
    expect(code).not.toMatch(/(println|logger\.\w+)\([^)\n]*[Pp]assword/);
  });
});

describe('…and no private key can reach the repository', () => {
  it('holds no keystore in android/app except the public debug one', () => {
    const keystores = readdirSync(appDir).filter((name) =>
      /\.(jks|keystore|p12)$/i.test(name),
    );
    expect(keystores).toEqual(['debug.keystore']);
  });

  it('ignores keystore files by pattern', () => {
    const ignore = readFileSync(join(__dirname, '..', '..', '.gitignore'), 'utf8');
    expect(ignore).toMatch(/^\*\.jks\s*$/m);
    expect(ignore).toMatch(/^\*\.keystore\s*$/m);
  });
});

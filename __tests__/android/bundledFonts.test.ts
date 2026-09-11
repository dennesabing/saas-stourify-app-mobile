/**
 * Guards the fix for clipped labels on Android (STOURIFY-263, STOURIFY-254).
 *
 * The app loads its fonts from JavaScript, a moment after the first screen is
 * laid out. Text measured in that moment is sized for the narrower system font,
 * then drawn in Inter or Fraunces — so "HOME" reads "HOM". React Native's
 * Android text engine caches measurements by font NAME, and the name does not
 * change when the real file arrives, so the clipping lasts the whole session.
 *
 * The fix is to ship every font inside the APK: android/app/build.gradle copies
 * them into assets/fonts/, where React Native finds a family by file name
 * before any JavaScript runs. These assertions stop a new font name from being
 * added to the theme without being added to that copy — which would quietly
 * bring the race back for that one font.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fontFamily } from '../../src/theme/tokens';

const mobileRoot = join(__dirname, '..', '..');
const gradle = readFileSync(join(mobileRoot, 'android', 'app', 'build.gradle'), 'utf8');

// Every quoted `….ttf` path the build names, relative to node_modules.
const bundled = Array.from(gradle.matchAll(/"([^"\s]+\.ttf)"/g), (match) => match[1]);

describe('the Android build ships every theme font inside the APK', () => {
  it.each(Object.values(fontFamily))('bundles %s under its own name', (family) => {
    // React Native resolves `fontFamily: 'X'` to assets/fonts/X.ttf, so the file
    // name must equal the family name exactly.
    expect(bundled.some((path) => path.endsWith(`/${family}.ttf`))).toBe(true);
  });

  it('names only files that exist, so the copy cannot silently come up empty', () => {
    // Gradle copies nothing, without complaint, from a path that is not there —
    // a renamed package would ship an APK with no fonts and pass the build.
    expect(bundled.length).toBeGreaterThan(0);
    for (const path of bundled) {
      expect(existsSync(join(mobileRoot, 'node_modules', path))).toBe(true);
    }
  });

  it('copies them into the assets/fonts folder React Native searches', () => {
    expect(gradle).toMatch(/into\s*\(?\s*["'].*fonts["']/);
    expect(gradle).toMatch(/assets\.srcDirs\s*\+=/);
  });
});

/**
 * Guards the property that decides WHICH BACKEND a test APK talks to.
 *
 * A `releaseDev` APK carries its JavaScript inside it, and the backend address is
 * compiled into that JavaScript at build time. So by the time the app is on a
 * phone, the address is a fact about the file, not a setting anybody can change.
 * Get it wrong and nothing errors: every request is answered, by the wrong
 * server, and the run reports a confident pass (STOURIFY-231).
 *
 * The address arrives from `.env` files, and Expo loads `mobile/.env.production.local`
 * ABOVE plain `mobile/.env` for any release-family build. `releaseDev` is one. That
 * file is gitignored, so it appears in no diff and no test can read its contents —
 * which is exactly why the protection has to be a refusal in the build rather than
 * a rule in a document.
 *
 * All of that protection used to live in `scripts/mobile-apk-builder.ps1`, so it
 * worked only for people who typed that command. These assertions are what stop it
 * moving back out of the build.
 *
 * This reads the build's SOURCE, which is the same thing its neighbour
 * `cleartextTraffic.test.ts` does and has the same limit: it cannot see what a real
 * build did. That stronger check is a command a reviewer runs against a real APK,
 * `bash scripts/check-apk-api-url.sh`, and it is written up in
 * mobile/docs/building-a-dev-release-apk.md.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const gradle = readFileSync(
  join(__dirname, '..', '..', 'android', 'app', 'build.gradle'),
  'utf8',
);

describe('the releaseDev build refuses to bake in the wrong backend', () => {
  it('knows about the gitignored file that outranks .env', () => {
    // The whole bug is that this file wins and nothing says so. A build that has
    // never heard of it cannot possibly report that it read it.
    expect(gradle).toContain('.env.production.local');
  });

  it('resolves the address the way Expo does, process environment first', () => {
    // Expo's loader skips any key already defined in the process environment, so a
    // shell `export` outranks every file. A guard that read only files would pass a
    // build it had mis-predicted.
    expect(gradle).toContain('EXPO_PUBLIC_API_URL');
    expect(gradle).toMatch(/System\.getenv\(\s*["']EXPO_PUBLIC_API_URL["']\s*\)/);

    // Then the files, in Expo's own order for a release-family build. Asserted as
    // one literal list rather than by comparing positions: `.env.production` is a
    // prefix of `.env.production.local`, so searching for them separately finds the
    // same place twice and proves nothing.
    expect(gradle).toMatch(
      /\[\s*"\.env\.production\.local",\s*"\.env\.local",\s*"\.env\.production",\s*"\.env"\s*\]/,
    );
  });

  it('is wired to the releaseDev build and not left as an unused function', () => {
    expect(gradle).toContain('assertDevApiUrlIsSafe');
    // The JavaScript bundling task for this variant is where the address is baked
    // in, so that is what the check has to sit in front of.
    expect(gradle).toContain('createBundleReleaseDevJsAndAssets');
  });

  it('treats "nothing resolved" as a refusal rather than a default', () => {
    // `client.ts` falls back to the production address whenever the variable is
    // unset and the build is not a development build. A releaseDev build is not a
    // development build. So an empty resolution IS a production build (STOURIFY-232).
    expect(gradle).toMatch(/no EXPO_PUBLIC_API_URL/i);
  });

  it('reads the forbidden addresses from app.json instead of hardcoding a hostname', () => {
    // A hostname typed into the build file is a copy that goes stale silently the
    // day a tier moves. The declaration lives in the root app.json deploy block.
    expect(gradle).toContain('deploy');
    expect(gradle).toContain('environments');
    expect(gradle).not.toContain('api.stourify.com');
  });

  it('compares what would be baked in against what mobile/.env declares', () => {
    // `mobile/.env` is the file every testing document tells you to edit and the
    // file the rig's own client-api-url-mismatch check reads. If the build is about
    // to disagree with it, the developer has to be told.
    expect(gradle).toMatch(/devDeclaredApiUrl|dotEnvApiUrl|envDeclaredApiUrl/);
  });

  it('opens the finished APK and checks what actually went in', () => {
    // Every other guard checks an INPUT and is therefore a prediction. This one
    // reads the file that is about to reach a phone.
    expect(gradle).toContain('index.android.bundle');
    expect(gradle).toContain('java.util.zip.ZipFile');
  });

  it('leaves the operator’s own file exactly where it is', () => {
    // The fix is to stop a DEV build reading that file, never to remove it:
    // production builds legitimately need it, and a build can be interrupted
    // half way through a rename.
    expect(gradle).not.toMatch(/renameTo|\.delete\(\)/);
  });
});

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

/**
 * The other direction: the guard must not refuse a PRODUCTION build.
 *
 * A bouncer told to stop anyone wearing a visitor badge is useless if he is posted
 * at the door everybody walks through. On 2026-08-28 that is exactly what happened:
 * the guard above decided whether to refuse by asking "is the task called
 * `preReleaseDevBuild` running?", and Gradle runs that task during a normal
 * production `assembleRelease` too. The production release could not be built at
 * all (STOURIFY-234).
 *
 * The reason is visible in the task names. Android's C++ compilation tasks are named
 * after the CMake build type — `RelWithDebInfo` — and not after the Android variant,
 * so `release` and `releaseDev` share one set of them. A shared task has to wait for
 * the setup step of every variant that uses it, so the production build ends up
 * running `releaseDev`'s setup step as well.
 *
 * Both directions are asserted here on purpose. STOURIFY-231 tested only that a bad
 * dev build is refused, which is why nobody noticed that every good production build
 * was refused too. A test that covers one direction is how this happened, so fixing
 * one of these by breaking the other has to fail here.
 */
describe('…and it does not refuse a production build', () => {
  // Comments in the build file legitimately discuss `preReleaseDevBuild` — that is
  // the whole story of this bug. What must not come back is the CODE keying on it,
  // so the comments are stripped before looking.
  //
  // The carriage returns come off FIRST, and that is not tidying. This file is
  // checked out with Windows line endings, and in a JavaScript regular expression
  // `.` refuses to match a carriage return the same way it refuses a newline — so
  // `//.*$` matched nothing at all and every comment sailed through. The stripper
  // silently did nothing and the assertion silently passed on prose.
  const code = gradle
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n');

  // Tasks Gradle runs during a production `assembleRelease` even though their names
  // say `releaseDev`. Measured with `./gradlew assembleRelease --dry-run`, which
  // prints the real list: this is the only one, out of roughly six hundred tasks.
  const IN_THE_PRODUCTION_GRAPH = ['preReleaseDevBuild'];

  it.each(IN_THE_PRODUCTION_GRAPH)(
    'never keys the guard on %s, which a production build also runs',
    (taskName) => {
      expect(code).not.toContain(taskName);
    },
  );

  it('asks the task graph what is actually being built, rather than guessing from one task', () => {
    // The honest question is "is this build going to produce a releaseDev artifact?",
    // and the task graph is the thing that decides that. Gradle hands the whole list
    // over before it executes anything, which is also EARLIER than the old check ran.
    expect(code).toContain('taskGraph.whenReady');
  });

  it('keys the graph check on tasks only a releaseDev assembly puts there', () => {
    // Each of these exists solely on the releaseDev path. None of them appears in
    // `assembleRelease --dry-run`.
    for (const anchor of [
      'assembleReleaseDev',
      'packageReleaseDev',
      'bundleReleaseDev',
      'createBundleReleaseDevJsAndAssets',
    ]) {
      expect(code).toContain(anchor);
    }
  });

  it('still refuses at the task that actually compiles the address in', () => {
    // This is the part that must survive every future edit. The graph check above is
    // only about how FAST you find out; this one is why the answer is right at all.
    // If the graph reasoning ever goes stale, the cost is a slower refusal, never a
    // missing one.
    expect(code).toMatch(
      /createBundleReleaseDevJsAndAssets[\s\S]{0,200}?assertDevApiUrlIsSafe/,
    );
  });

  it('still opens the finished releaseDev APK and checks what went in', () => {
    // Bundling can be skipped as up to date, and an input check is a prediction.
    expect(code).toMatch(/assembleReleaseDev[\s\S]{0,600}?assertApkApiUrlIsSafe/);
  });
});

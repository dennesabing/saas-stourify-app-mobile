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

/**
 * The third direction: the PRODUCTION build has to be guarded too.
 *
 * A factory x-rays every box on the export line and none on the domestic line,
 * because the export line is where a problem was found once. Then somebody ships a
 * domestic box abroad.
 *
 * That is what this block is about (STOURIFY-235). Everything above is about the
 * `releaseDev` variant. The production `release` variant had no build-time check at
 * all — its protection lived entirely in `scripts/mobile-apk-builder.ps1`, which is
 * exactly the wrapper-only shape STOURIFY-231 spent a card removing from the dev
 * side. `./gradlew assembleRelease` would happily compile a laptop's address into a
 * public APK and say nothing at all.
 *
 * The complication, and the reason this is not simply "release means production":
 * `mobile-apk-builder.ps1 -Target dev` also builds the `release` variant. It hides
 * `.env.production.local` so the local address wins, and publishes the result to the
 * private dev channel. So the variant does not say which tier a build is for, and a
 * rule that assumed it did would refuse a build somebody runs on purpose — which is
 * STOURIFY-234's bug all over again, one door along.
 *
 * So the caller says which tier: `-PstourifyReleaseTier=dev` puts the build under
 * the dev rules, and silence means production. The DEFAULT is the part that matters
 * and it is asserted below — an unattended `./gradlew assembleRelease` is the build
 * this card exists for, and it has to be the one that refuses.
 */
describe('…and the production build is guarded as well', () => {
  // Same stripper as the block above, and for the same reason: the comments here
  // legitimately discuss every task name in the file.
  const code = gradle
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n');

  it('has a production check at all, and not only a dev one', () => {
    expect(code).toContain('assertProdApiUrlIsSafe');
  });

  it('defaults to production when nobody says which tier the build is for', () => {
    // This single assertion is the card. If the default ever flips, a bare
    // `./gradlew assembleRelease` stops being checked and nothing else here notices.
    expect(code).toMatch(
      /findProperty\(\s*["']stourifyReleaseTier["']\s*\)\s*\?:\s*["']production["']/,
    );
  });

  it('lets a caller name the dev tier, so the dev download channel still builds', () => {
    // `mobile-apk-builder.ps1 -Target dev` builds the `release` variant with the
    // local address in it. Without this escape hatch the guard would refuse it, and
    // that is exactly the mistake STOURIFY-234 was about.
    expect(code).toMatch(/stourifyReleaseTier/);
    expect(code).toMatch(/releaseTierName\s*==\s*["']dev["']/);
  });

  it('refuses at the task that actually compiles the address into a release build', () => {
    // Nothing can bake an address into the JavaScript without running this task, so
    // this is the attachment that makes the answer right rather than merely fast.
    expect(code).toContain('createBundleReleaseJsAndAssets');
  });

  it('opens the finished production APK and reads what really went in', () => {
    // Every input check is a prediction. This one reads the file that would reach a
    // user's phone.
    expect(code).toContain('assertApkIsProductionSafe');
    expect(code).toMatch(/"assembleRelease"[\s\S]{0,900}?assertReleaseApkIsSafe/);
  });

  it('asks the task graph, keyed on tasks only a release assembly puts there', () => {
    // Measured with `./gradlew assembleRelease --dry-run` (574 tasks) against
    // `./gradlew assembleReleaseDev --dry-run` (67 :app: tasks): none of these
    // appears in the releaseDev graph, and that graph carries no non-Dev release
    // task at all, not even preReleaseBuild. The contamination runs one way only.
    for (const anchor of [
      '"assembleRelease"',
      '"packageRelease"',
      '"bundleRelease"',
      '"createBundleReleaseJsAndAssets"',
    ]) {
      expect(code).toContain(anchor);
    }
  });

  it('treats "nothing resolved" as a refusal for a production build too', () => {
    // Since STOURIFY-232 a release-family build with no address refuses to START.
    // An unset variable is a dead app, not a neutral state.
    expect(code).toMatch(
      /assertProdApiUrlIsSafe[\s\S]{0,2500}?no EXPO_PUBLIC_API_URL/i,
    );
  });

  it('reads the production address from app.json rather than naming a host', () => {
    // Same rule as the dev side: a hostname typed into a build file is a copy that
    // goes stale in silence the day a tier moves. The whole-file assertion in the
    // first block already forbids the literal; this one says where it comes from.
    expect(code).toMatch(/tierOrigins/);
  });
});

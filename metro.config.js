// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config')
const { execFileSync } = require('child_process')
const path = require('path')

// Stamp the short git commit into the bundle, so the line the app renders
// (`src/shared/config/buildIdentity.ts`) says WHICH build it is and not merely
// which version. Two projects can both honestly report `0.3.0`; they cannot
// share a commit id, and a bundle loaded from the wrong project's server is a
// failure this machine has actually had — see `.claude/docs/testing.md` →
// *Client identity*.
//
// It has to happen here rather than in a committed file: a file in git cannot
// contain the id of the commit that contains it. Metro's config is loaded in
// the process that later spawns the transform workers, so setting the variable
// now is what puts it in front of Expo's `EXPO_PUBLIC_*` inlining.
//
// Anything already in the environment wins — a CI job that knows the real
// commit should not be overruled by whatever this checkout happens to be on.
if (!process.env.EXPO_PUBLIC_BUILD_COMMIT) {
  try {
    process.env.EXPO_PUBLIC_BUILD_COMMIT = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // No git, or not a checkout. The app renders `local`, which is true.
  }
}

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '..')
const packagesRoot = path.resolve(monorepoRoot, 'packages')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot)

// `@soxerp/offline-sync-core` ships raw ESM TypeScript ("main": "src/index.ts",
// no build step) and lives OUTSIDE mobile/. Metro only transpiles files it
// watches, so all three of these are required: watchFolders to bring the
// sources into the graph, nodeModulesPaths so the sibling package's own
// resolutions still work, and extraNodeModules so the bare specifier resolves
// without depending on symlink support.
config.watchFolders = [packagesRoot]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@soxerp/offline-sync-core': path.resolve(packagesRoot, 'offline-sync-core'),
}

module.exports = config

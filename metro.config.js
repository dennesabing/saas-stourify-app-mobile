// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');
const packagesRoot = path.resolve(monorepoRoot, 'packages');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// `@soxerp/offline-sync-core` ships raw ESM TypeScript ("main": "src/index.ts",
// no build step) and lives OUTSIDE mobile/. Metro only transpiles files it
// watches, so all three of these are required: watchFolders to bring the
// sources into the graph, nodeModulesPaths so the sibling package's own
// resolutions still work, and extraNodeModules so the bare specifier resolves
// without depending on symlink support.
config.watchFolders = [packagesRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@soxerp/offline-sync-core': path.resolve(packagesRoot, 'offline-sync-core'),
};

module.exports = config;

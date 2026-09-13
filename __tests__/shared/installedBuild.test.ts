import appJson from '../../app.json'

/**
 * The version line About shows, for a build that carries no Expo config at all
 * (STOURIFY-291). It should fall back to the numbers the bundle was compiled
 * with rather than render "Version undefined".
 */
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: null } }))

import {
  INSTALLED_BUILD,
  INSTALLED_VERSION,
  INSTALLED_VERSION_LINE,
} from '@/shared/config/installedBuild'

test('falls back to the bundled app.json when the build carries no config', () => {
  expect(INSTALLED_VERSION).toBe(appJson.expo.version)
  expect(INSTALLED_BUILD).toBe(String(appJson.expo.android.versionCode))
  expect(INSTALLED_VERSION_LINE).toBe(
    `Version ${appJson.expo.version} (build ${appJson.expo.android.versionCode})`,
  )
})

import { render } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import FollowSuggestionsScreen from '@/features/onboarding/screens/FollowSuggestionsScreen'
import HomeCityScreen from '@/features/onboarding/screens/HomeCityScreen'
import InterestsScreen from '@/features/onboarding/screens/InterestsScreen'
import PermissionsScreen from '@/features/onboarding/screens/PermissionsScreen'
import { createTestDatabase } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'

/**
 * STOURIFY-81.
 *
 * A phone reserves a strip along the bottom of the screen for its own back,
 * home and recents controls, and tells each app how tall that strip is. An app
 * that ignores the measurement draws its own controls underneath the phone's,
 * where a tap can land on the system instead of the app. Onboarding's Skip link
 * was drawn there — and Skip is the only way past the interests step.
 *
 * Onboarding is the one stack in this app with nothing between its footer and
 * that strip: every other screen sits inside the tab navigator, whose tab bar
 * already occupies it. So the rule has to be restated on each of the four
 * screens, and this test is what keeps them in step — the fix is a single word
 * in a prop, which is exactly the kind of thing a fifth screen gets written
 * without.
 *
 * ## Why this reads a prop rather than a measurement
 *
 * `SafeAreaView` reserves an edge in native code, so under jest no padding is
 * ever computed and there is no number to assert. What does survive into the
 * rendered tree is the request itself: the `edges` prop arrives on the native
 * `RNCSafeAreaView` node as a per-side map, where `off` means "do not reserve
 * this side". Asserting the request is the honest thing this environment can
 * check — whether the operating system then honours it is what the live run on
 * a real handset is for.
 */
const OFF = 'off'

const navigation = { navigate: jest.fn(), goBack: jest.fn(), popTo: jest.fn() } as any

function route(name: string) {
  return { key: name, name } as any
}

/** Every `edges` map in the rendered tree, root included. */
function safeAreaEdges(element: ReactElement): Record<string, string>[] {
  const tree = render(
    <TestProviders database={createTestDatabase()}>{element}</TestProviders>,
  ).toJSON()

  const found: Record<string, string>[] = []

  function walk(node: unknown): void {
    if (node === null || typeof node !== 'object') return

    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }

    const element = node as { props?: Record<string, unknown>; children?: unknown[] }
    const edges = element.props?.edges

    if (edges !== null && typeof edges === 'object') {
      found.push(edges as Record<string, string>)
    }

    element.children?.forEach(walk)
  }

  walk(tree)

  return found
}

describe('onboarding screens reserve the system navigation bar', () => {
  it.each([
    ['Interests', () => <InterestsScreen navigation={navigation} route={route('Interests')} />],
    ['HomeCity', () => <HomeCityScreen navigation={navigation} route={route('HomeCity')} />],
    [
      'FollowSuggestions',
      () => <FollowSuggestionsScreen navigation={navigation} route={route('FollowSuggestions')} />,
    ],
    [
      'Permissions',
      () => <PermissionsScreen navigation={navigation} route={route('Permissions')} />,
    ],
  ])('%s keeps its content above the bottom bar', (_name, build) => {
    const edges = safeAreaEdges(build())

    expect(edges).not.toHaveLength(0)
    edges.forEach((edge) => {
      expect(edge.bottom).not.toBe(OFF)
      expect(edge.top).not.toBe(OFF)
    })
  })
})

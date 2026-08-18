import { render } from '@testing-library/react-native'

/**
 * Every stack registered by `TabNavigator`, as a list of route names.
 *
 * The mocks below never render a screen — they only report what was registered.
 * That keeps this test about the app's wiring rather than about any screen's
 * contents, and it is why it stays fast despite touching the whole navigator.
 */
const stacks: string[][] = []

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react')
  return {
    __esModule: true,
    createNativeStackNavigator: () => ({
      Navigator: ({ children }: { children: React.ReactNode }) => {
        stacks.push(
          React.Children.toArray(children)
            .map((child: any) => child?.props?.name)
            .filter(Boolean),
        )
        return null
      },
      Screen: () => null,
    }),
  }
})

jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react')
  return {
    __esModule: true,
    createBottomTabNavigator: () => ({
      // Each tab's `component` IS a stack, so rendering them is what makes the
      // stacks above report themselves.
      Navigator: ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          React.Fragment,
          null,
          React.Children.toArray(children).map((child: any) =>
            child?.props?.component
              ? React.createElement(child.props.component, { key: child.props.name })
              : null,
          ),
        ),
      Screen: () => null,
    }),
  }
})

import TabNavigator from '@/shared/navigation/TabNavigator'

function createStack(): string[] {
  stacks.length = 0
  render(<TabNavigator />)

  const stack = stacks.find((names) => names.includes('CreateMenu'))
  if (!stack) throw new Error('no stack registered a CreateMenu route')
  return stack
}

/**
 * STOURIFY-118: after the app is killed and restarted with no network, the
 * queue screens have to be reachable from a stack that does not depend on one.
 *
 * The Create stack is that stack — its first screen is a plain menu that reads
 * nothing from the server. The Profile stack cannot be, because its first
 * screen fetches the profile and renders an error wall when it cannot.
 */
it('registers My spots in the Create stack', () => {
  expect(createStack()).toContain('MySpots')
})

it('registers Sync status in the Create stack, not only behind Profile', () => {
  expect(createStack()).toContain('SyncStatus')
})

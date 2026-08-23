import { render, screen } from '@testing-library/react-native'
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import KeyboardAwareScreen from '@/shared/components/ui/KeyboardAwareScreen'
import { ThemeProvider } from '@/theme/ThemeProvider'

/**
 * STOURIFY-100. The app runs edge-to-edge (`edgeToEdgeEnabled=true`, required by
 * Expo SDK 54), which stops Android resizing the window when the keyboard opens
 * — `android:windowSoftInputMode="adjustResize"` is still in the manifest and no
 * longer does anything. The app draws *under* the keyboard, so any field low on
 * the page is hidden behind it. Nothing in `src/` moved content out of the way.
 *
 * These tests pin the two things that make the difference: that a
 * `KeyboardAvoidingView` is in the tree at all, and that the scroll view keeps
 * taps alive while the keyboard is open — without the latter the first tap on
 * "Create account" only dismisses the keyboard.
 */

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

function renderInProviders(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider scheme="light">{ui}</ThemeProvider>
    </SafeAreaProvider>,
  )
}

test('the children render', () => {
  renderInProviders(
    <KeyboardAwareScreen>
      <View testID="screen-child" />
    </KeyboardAwareScreen>,
  )

  expect(screen.getByTestId('screen-child')).toBeTruthy()
})

test('a keyboard-avoiding view wraps the content, enabled', () => {
  renderInProviders(
    <KeyboardAwareScreen>
      <Text>Anything</Text>
    </KeyboardAwareScreen>,
  )

  const avoider = screen.UNSAFE_getByType(KeyboardAvoidingView)

  expect(avoider).toBeTruthy()
  // `enabled` defaults to true, so only an explicit `false` is a defect.
  expect(avoider.props.enabled).not.toBe(false)
  expect(avoider.props.behavior).toBeDefined()
})

test('taps survive an open keyboard', () => {
  renderInProviders(
    <KeyboardAwareScreen>
      <Text>Anything</Text>
    </KeyboardAwareScreen>,
  )

  const scroller = screen.UNSAFE_getByType(ScrollView)

  // Without this, the first tap on a button below the fields is swallowed by
  // the keyboard dismiss and the user has to tap twice.
  expect(scroller.props.keyboardShouldPersistTaps).toBe('handled')
})

test('centered content still fills the screen so it can scroll when the keyboard opens', () => {
  renderInProviders(
    <KeyboardAwareScreen centered>
      <Text>Anything</Text>
    </KeyboardAwareScreen>,
  )

  const style = Object.assign(
    {},
    ...[screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle].flat(),
  )

  expect(style.justifyContent).toBe('center')
  // `flexGrow: 1` is what lets the content centre on a tall screen and still
  // scroll once the keyboard has taken half of it.
  expect(style.flexGrow).toBe(1)
})

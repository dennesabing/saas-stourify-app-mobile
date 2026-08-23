import { render, screen } from '@testing-library/react-native'
import { View } from 'react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import Sheet from '@/shared/components/ui/Sheet'
import { ThemeProvider } from '@/theme/ThemeProvider'

/**
 * The sheet primitive (STOURIFY-37).
 *
 * One of these assertions exists because of a defect the emulator found and no
 * unit test would have: the sheet's bottom padding was a fixed spacing token, so
 * its last control — the primary action, by convention — ended up in the same
 * strip of screen as the tab bar and the Android gesture bar. A modal draws over
 * the tab bar, so nothing looked wrong; a tap aimed at "Submit report" opened the
 * Create tab instead. Reserving the reported bottom inset is the fix, and this
 * test is what stops the fixed value coming back.
 */

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

function renderSheet(insetBottom = 34) {
  return render(
    <SafeAreaProvider
      initialMetrics={{ ...METRICS, insets: { ...METRICS.insets, bottom: insetBottom } }}
    >
      <ThemeProvider scheme="light">
        <Sheet visible onClose={() => {}} title="A title" subtitle="A subtitle">
          <View testID="sheet-child" />
        </Sheet>
      </ThemeProvider>
    </SafeAreaProvider>,
  )
}

function flatten(style: unknown): Record<string, unknown> {
  return Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>)
}

/** The panel is the ancestor of the children that carries the bottom padding. */
function panelPadding() {
  const child = screen.getByTestId('sheet-child')
  let node: any = child.parent
  while (node) {
    const padding = flatten(node.props?.style).paddingBottom
    if (typeof padding === 'number' && padding > 0) return padding
    node = node.parent
  }
  return undefined
}

test('the title and subtitle render, and so do the children', () => {
  renderSheet()

  expect(screen.getByText('A title')).toBeTruthy()
  expect(screen.getByText('A subtitle')).toBeTruthy()
  expect(screen.getByTestId('sheet-child')).toBeTruthy()
})

test('the backdrop is a dismiss control, not decoration', () => {
  renderSheet()

  // A sheet reachable only by a small ✕ is a sheet people get stuck in, and a
  // screen reader needs the gesture named.
  expect(screen.getByLabelText('Dismiss')).toBeTruthy()
})

test('the panel reserves the device bottom inset so its last control is reachable', () => {
  renderSheet(34)
  const withInset = panelPadding()

  screen.unmount()

  renderSheet(0)
  const withoutInset = panelPadding()

  expect(withInset).toBeDefined()
  expect(withoutInset).toBeDefined()
  // The whole bug: a fixed padding gives the same value on a device with a
  // gesture bar as on one without, and on the former the primary action lands
  // under the system navigation.
  expect(withInset as number).toBeGreaterThan(withoutInset as number)
  expect(withInset as number).toBeGreaterThanOrEqual(34)
})

test('a hidden sheet renders nothing at all', () => {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider scheme="light">
        <Sheet visible={false} onClose={() => {}} title="A title">
          <View testID="sheet-child" />
        </Sheet>
      </ThemeProvider>
    </SafeAreaProvider>,
  )

  // Screens mount their sheets once and toggle `visible`, so a hidden sheet that
  // still rendered its children would put duplicate labels on every screen.
  expect(screen.queryByTestId('sheet-child')).toBeNull()
  expect(screen.queryByText('A title')).toBeNull()
})

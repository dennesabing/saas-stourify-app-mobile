import { render, screen } from '@testing-library/react-native'
import OverlayHeader from '@/shared/components/ui/OverlayHeader'
import { spacing } from '@/theme/tokens'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

/** Flattens RN's array-of-styles into one object. */
function styleOf(element: { props: { style?: unknown } }): Record<string, unknown> {
  const flatten = (input: unknown): Record<string, unknown> =>
    Array.isArray(input)
      ? Object.assign({}, ...input.map(flatten))
      : ((input ?? {}) as Record<string, unknown>)
  return flatten(element.props.style)
}

function renderHeader(props: { topInset?: number } = {}) {
  return render(
    <TestProviders database={createTestDatabase()}>
      <OverlayHeader testID="header" onBack={() => {}} {...props} />
    </TestProviders>,
  )
}

/**
 * STOURIFY-255. The header is absolutely positioned, and an absolutely placed
 * box is measured from its parent's outer edge — a `SafeAreaView` parent's
 * top padding does nothing for it. So a caller whose header sits directly in
 * the screen root has to say how tall the status bar is, and one whose header
 * sits inside something already below the status bar must not be moved.
 */
describe('OverlayHeader top offset', () => {
  it('sits the usual gap from the top of its container when given no inset', () => {
    renderHeader()

    // The spot page relies on this: its header lives inside the hero, which is
    // already below the status bar, so adding an inset there would push the
    // button down twice.
    expect(styleOf(screen.getByTestId('header')).top).toBe(spacing[3])
  })

  it('adds the inset it is given on top of the usual gap', () => {
    renderHeader({ topInset: 52 })

    expect(styleOf(screen.getByTestId('header')).top).toBe(52 + spacing[3])
  })
})

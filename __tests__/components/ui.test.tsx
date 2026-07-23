import { fireEvent, render, screen } from '@testing-library/react-native'
import { Button, Chip, EmptyState, SpotCard, Tag } from '@/shared/components/ui'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { minTouchTarget } from '@/theme/tokens'

function renderThemed(ui: React.ReactElement) {
  return render(<ThemeProvider scheme="light">{ui}</ThemeProvider>)
}

/** Flattens RN's array-of-styles into one object. */
function styleOf(element: { props: { style?: unknown } }): Record<string, unknown> {
  const style = element.props.style
  const flatten = (input: unknown): Record<string, unknown> => {
    if (Array.isArray(input)) return Object.assign({}, ...input.map(flatten))
    return (input ?? {}) as Record<string, unknown>
  }
  return flatten(style)
}

describe('Button', () => {
  it('fires onPress when enabled', () => {
    const onPress = jest.fn()
    renderThemed(<Button label="Publish spot" onPress={onPress} />)

    fireEvent.press(screen.getByText('Publish spot'))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire while loading', () => {
    const onPress = jest.fn()
    renderThemed(<Button label="Publish spot" onPress={onPress} loading />)

    // The label is replaced by a spinner, so press the button by role.
    fireEvent.press(screen.getByRole('button'))

    expect(onPress).not.toHaveBeenCalled()
  })

  it('meets the minimum touch target', () => {
    renderThemed(<Button label="Follow" />)

    expect(styleOf(screen.getByRole('button')).minHeight).toBe(minTouchTarget)
  })

  it('exposes disabled state to assistive technology', () => {
    renderThemed(<Button label="Follow" disabled />)

    expect(screen.getByRole('button')).toBeDisabled()
  })
})

describe('Chip', () => {
  it('reports its selected state', () => {
    renderThemed(<Chip label="Nature" selected />)

    expect(screen.getByRole('button', { selected: true })).toBeTruthy()
  })

  it('meets the minimum touch target', () => {
    renderThemed(<Chip label="Nature" />)

    expect(styleOf(screen.getByRole('button')).minHeight).toBe(minTouchTarget)
  })
})

describe('Tag', () => {
  it('renders the category label', () => {
    renderThemed(<Tag label="Viewpoint" />)

    expect(screen.getByText('Viewpoint')).toBeTruthy()
  })
})

describe('SpotCard', () => {
  it('renders title, category and meta', () => {
    renderThemed(
      <SpotCard
        title="Sunset Ridge Overlook"
        category="Viewpoint"
        rating={4.8}
        reviewCount={212}
        meta="Kadayawan Hills · 1.2 km away"
      />,
    )

    expect(screen.getByText('Sunset Ridge Overlook')).toBeTruthy()
    expect(screen.getByText('Viewpoint')).toBeTruthy()
    expect(screen.getByText('Kadayawan Hills · 1.2 km away')).toBeTruthy()
  })

  it('surfaces the queued affordance for a spot written offline', () => {
    // The offline-first contract is user-visible: a queued write must say so.
    renderThemed(<SpotCard title="Hidden Cove" isQueued />)

    expect(screen.getByText('Queued ↑')).toBeTruthy()
  })

  it('omits the queued affordance once synced', () => {
    renderThemed(<SpotCard title="Hidden Cove" />)

    expect(screen.queryByText('Queued ↑')).toBeNull()
  })
})

describe('EmptyState', () => {
  it('offers the action when one is given', () => {
    const onAction = jest.fn()
    renderThemed(
      <EmptyState title="Your feed is empty" actionLabel="Find explorers" onAction={onAction} />,
    )

    fireEvent.press(screen.getByText('Find explorers'))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders without an action', () => {
    renderThemed(<EmptyState title="Nothing yet" />)

    expect(screen.getByText('Nothing yet')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

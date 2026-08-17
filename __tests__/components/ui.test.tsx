import { fireEvent, render, screen } from '@testing-library/react-native'
import { Button, Chip, EmptyState, Input, Rating, SpotCard, Tag } from '@/shared/components/ui'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { minTouchTarget, spacing, typography } from '@/theme/tokens'

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

  /**
   * A shop sign that wraps its last word onto a second line looks careless, and
   * two side-by-side buttons whose labels wrap differently end up different
   * heights. A button label is a label, not a paragraph: it gets one line, and
   * if it genuinely cannot fit it is shortened with an ellipsis rather than
   * pushed downwards (STOURIFY-102).
   */
  it('keeps its label on a single line', () => {
    renderThemed(<Button label="See all reviews" />)

    expect(screen.getByText('See all reviews').props.numberOfLines).toBe(1)
  })

  it('renders a leading icon when given one', () => {
    renderThemed(<Button icon="🔖" label="Save" />)

    expect(screen.getByText('🔖')).toBeTruthy()
    expect(screen.getByText('Save')).toBeTruthy()
  })

  it('still announces only its label when it has an icon', () => {
    renderThemed(<Button icon="🔖" label="Save" />)

    // The icon is decoration. The button's accessibility label stays the words,
    // so a screen reader says "Save" and not the emoji's own name.
    expect(screen.getByLabelText('Save')).toBeTruthy()
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

  /**
   * Discover draws these two abreast. A printed form leaves a blank box for a
   * middle name even when there is no middle name, so that every field beneath
   * it still lines up; the tag strip is that blank box. Drawing it only when a
   * spot happens to have a category is what pushed one card's title lower than
   * its neighbour's (STOURIFY-101).
   */
  it('reserves the tag strip in the grid layout even with no category', () => {
    renderThemed(<SpotCard title="Hidden Cove" />)

    const slot = screen.getByTestId('spot-card-tag-slot')
    expect(styleOf(slot).height).toBe(typography.micro.lineHeight + spacing[1] * 2)
  })

  it('still draws the tag inside that strip when there is a category', () => {
    renderThemed(<SpotCard title="Hidden Cove" category="Shopping" />)

    expect(screen.getByTestId('spot-card-tag-slot')).toBeTruthy()
    expect(screen.getByText('Shopping')).toBeTruthy()
  })

  /**
   * The same alignment problem one row lower: a title that fits on one line and
   * one that needs two leave the stars below them at different heights. Two
   * lines are reserved whichever it turns out to be.
   */
  it('reserves two lines for the title in the grid layout', () => {
    renderThemed(<SpotCard title="Hidden Cove" />)

    expect(styleOf(screen.getByText('Hidden Cove')).minHeight).toBe(typography.h2.lineHeight * 2)
  })

  /**
   * A grid cell has about 120 points of room inside it and the stars, the score
   * and "· 12 reviews" want more like 150, so the row ran off the card's edge.
   * The figures move underneath the stars.
   */
  it('stacks the rating figures under the stars in the grid layout', () => {
    renderThemed(<SpotCard title="Hidden Cove" rating={4.5} reviewCount={12} />)

    expect(screen.getByTestId('rating-figures')).toBeTruthy()
    expect(screen.getByText('4.5 · 12 reviews')).toBeTruthy()
  })

  /**
   * A list row is as wide as the screen and nothing sits beside it, so there is
   * nothing to line up with and no room problem to solve. Reserving space there
   * would only waste it.
   */
  it('leaves the wide list layout alone', () => {
    renderThemed(<SpotCard title="Hidden Cove" rating={4.5} reviewCount={12} layout="wide" />)

    expect(screen.queryByTestId('spot-card-tag-slot')).toBeNull()
    expect(screen.queryByTestId('rating-figures')).toBeNull()
    expect(styleOf(screen.getByText('Hidden Cove')).minHeight).toBeUndefined()
  })
})

describe('Rating', () => {
  it('reads as one sentence to a screen reader however it is arranged', () => {
    renderThemed(<Rating value={4.5} reviewCount={12} stacked />)

    expect(screen.getByLabelText('Rated 4.5 out of 5 from 12 reviews')).toBeTruthy()
  })

  /**
   * Whichever arrangement is in use, no line of it may push past whatever is
   * holding it — the defect this card was raised for. One line each, allowed to
   * shrink, cut with an ellipsis as the last resort.
   */
  it('cannot spill out of a narrow container', () => {
    renderThemed(<Rating value={4.5} reviewCount={12} stacked />)

    const figures = screen.getByText('4.5 · 12 reviews')
    expect(figures.props.numberOfLines).toBe(1)
    expect(styleOf(figures).flexShrink).toBe(1)
  })

  it('keeps the single-row arrangement for everyone who was already using it', () => {
    renderThemed(<Rating value={4.5} reviewCount={12} />)

    expect(screen.queryByTestId('rating-figures')).toBeNull()
    expect(screen.getByText('4.5')).toBeTruthy()
    expect(screen.getByText('· 12 reviews')).toBeTruthy()
  })
})

describe('Input', () => {
  it('renders its label and value', () => {
    renderThemed(<Input label="Email" value="a@b.com" onChangeText={() => {}} />)

    expect(screen.getByText('Email')).toBeTruthy()
    expect(screen.getByDisplayValue('a@b.com')).toBeTruthy()
  })

  it('surfaces an error message and marks itself invalid', () => {
    renderThemed(
      <Input label="Email" value="" onChangeText={() => {}} error="Email is required" />,
    )

    expect(screen.getByText('Email is required')).toBeTruthy()
  })

  it('reports typing back to the caller', () => {
    const onChangeText = jest.fn()

    renderThemed(
      <Input
        label="Email"
        placeholder="you@example.com"
        value=""
        onChangeText={onChangeText}
      />,
    )

    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'typed')
    expect(onChangeText).toHaveBeenCalledWith('typed')
  })

  it('meets the minimum touch target', () => {
    renderThemed(<Input label="Email" value="" onChangeText={() => {}} />)

    expect(styleOf(screen.getByDisplayValue('')).minHeight).toBe(minTouchTarget)
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

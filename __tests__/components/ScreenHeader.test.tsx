import { fireEvent, render, screen } from '@testing-library/react-native'
import { ScreenHeader } from '@/shared/components/ui'
import { ThemeProvider } from '@/theme/ThemeProvider'

/**
 * STOURIFY-209 — a screen you arrived at from somewhere else has to say what it
 * is about, and its title belongs under the way back rather than beside it.
 *
 * This is the shared header behind that. It exists because the same complaint
 * has now been made about three different screens — a note's replies, the photo
 * gallery, and the review pages. Three reports of one thing is a pattern, and a
 * pattern deserves one component rather than a fourth hand-rolled header.
 */
function renderHeader(props: Partial<React.ComponentProps<typeof ScreenHeader>> = {}) {
  return render(
    <ThemeProvider scheme="light">
      <ScreenHeader testID="hdr" onBack={jest.fn()} title="Reviews" {...props} />
    </ThemeProvider>,
  )
}

it('shows the title and the way back', () => {
  renderHeader()

  expect(screen.getByText('Reviews')).toBeTruthy()
  expect(screen.getByLabelText('Back')).toBeTruthy()
})

it('names what the screen is about when it knows', () => {
  renderHeader({ subtitle: 'Blue Cove' })

  expect(screen.getByTestId('hdr-subtitle')).toBeTruthy()
  expect(screen.getByText('Blue Cove')).toBeTruthy()
})

/**
 * The subtitle is usually not known until a request comes back. A line that is
 * present but empty claims to answer "what is this about?" and does not — worse
 * than no line at all.
 */
it('renders no second line when it does not know', () => {
  renderHeader({ subtitle: null })

  expect(screen.queryByTestId('hdr-subtitle')).toBeNull()
})

it('goes back when Back is pressed', () => {
  const onBack = jest.fn()
  renderHeader({ onBack })

  fireEvent.press(screen.getByLabelText('Back'))

  expect(onBack).toHaveBeenCalledTimes(1)
})

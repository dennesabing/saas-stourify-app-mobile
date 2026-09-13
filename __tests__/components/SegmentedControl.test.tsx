import { StyleSheet } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { SegmentedControl } from '@/shared/components/ui'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { palette, type ColorScheme } from '@/theme/tokens'

/**
 * The segmented switch must show which side is chosen in BOTH themes.
 *
 * Found on the emulator under STOURIFY-289: in the dark palette the raised
 * segment (`card`) and the track (`surfaceAlt`) are the same colour, so the
 * Followers / Following switch — and Search's and Nearby's — looked unchosen
 * on both sides. These tests compare the two backgrounds directly, so a
 * palette change that makes them equal again fails here.
 */

function renderSwitch(scheme: ColorScheme, onChange = jest.fn()) {
  render(
    <ThemeProvider scheme={scheme}>
      <SegmentedControl
        testID="switch"
        value="a"
        onChange={onChange}
        options={[
          { key: 'a', label: 'First' },
          { key: 'b', label: 'Second' },
        ]}
      />
    </ThemeProvider>,
  )
  return onChange
}

function background(testIdOrLabel: { label?: string; testID?: string }): string | undefined {
  const node = testIdOrLabel.label
    ? screen.getByLabelText(testIdOrLabel.label)
    : screen.getByTestId(testIdOrLabel.testID!)
  return StyleSheet.flatten(node.props.style)?.backgroundColor
}

describe.each<ColorScheme>(['light', 'dark'])('in the %s theme', (scheme) => {
  test('the chosen segment stands out from the track behind it', () => {
    renderSwitch(scheme)

    const track = background({ testID: 'switch' })
    const chosen = background({ label: 'First' })

    expect(chosen).toBeDefined()
    expect(chosen).not.toBe(track)
  })

  test('only the chosen segment is marked selected', () => {
    renderSwitch(scheme)

    expect(screen.getByLabelText('First').props.accessibilityState).toEqual({ selected: true })
    expect(screen.getByLabelText('Second').props.accessibilityState).toEqual({ selected: false })
  })
})

test('in the light theme the chosen segment is still the design’s white card', () => {
  renderSwitch('light')

  expect(background({ label: 'First' })).toBe(palette.light.card)
})

test('pressing a segment reports its key', () => {
  const onChange = renderSwitch('light')

  fireEvent.press(screen.getByLabelText('Second'))

  expect(onChange).toHaveBeenCalledWith('b')
})

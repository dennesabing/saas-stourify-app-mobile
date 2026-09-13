import { render, screen } from '@testing-library/react-native'
import { BarHeader } from '@/shared/components/ui'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

/**
 * `BarHeader`'s optional second line (STOURIFY-293). The photo gallery and the
 * reviews list use it to say which spot they belong to — the thing STOURIFY-199
 * and STOURIFY-209 each asked for after readers lost track of where they were.
 */
function renderHeader(props: { subtitle?: string | null } = {}) {
  return render(
    <TestProviders database={createTestDatabase()}>
      <BarHeader testID="bar" title="Reviews" onBack={jest.fn()} {...props} />
    </TestProviders>,
  )
}

it('draws the subtitle under the title when there is one', () => {
  renderHeader({ subtitle: 'Blue Cove' })

  expect(screen.getByText('Reviews')).toBeTruthy()
  expect(screen.getByTestId('bar-subtitle')).toBeTruthy()
  expect(screen.getByText('Blue Cove')).toBeTruthy()
})

it('draws no empty second line when there is none', () => {
  renderHeader({ subtitle: null })

  expect(screen.getByText('Reviews')).toBeTruthy()
  expect(screen.queryByTestId('bar-subtitle')).toBeNull()
})

it('keeps the round Back button', () => {
  renderHeader()

  expect(screen.getByLabelText('Back')).toBeTruthy()
})

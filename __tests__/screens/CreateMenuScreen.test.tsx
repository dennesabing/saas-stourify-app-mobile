import { fireEvent, render, screen } from '@testing-library/react-native'
import CreateMenuScreen from '@/features/create/screens/CreateMenuScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

beforeEach(() => {
  jest.clearAllMocks()
})

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <CreateMenuScreen navigation={navigation} route={{ key: 'CreateMenu', name: 'CreateMenu' } as any} />
    </TestProviders>,
  )
}

it('opens the spot form', () => {
  renderScreen()

  fireEvent.press(screen.getByLabelText('New Spot'))

  expect(navigation.navigate).toHaveBeenCalledWith('CreateSpot')
})

/**
 * `MediaPicker` is the only route into `PostCompose`, and nothing navigated to
 * it — the compose screen was unreachable through the UI, which is why the two
 * defects in STOURIFY-18 survived so long unnoticed.
 */
it('opens the post composer via the media picker', () => {
  renderScreen()

  fireEvent.press(screen.getByLabelText('New Post'))

  expect(navigation.navigate).toHaveBeenCalledWith('MediaPicker')
})

/**
 * Capture is reachable only from inside the spot-create sequence now.
 *
 * The temporary Add-photos card here existed to make the camera screens
 * reachable before publish did — and every photo taken through it was bound to
 * nothing, because there was no spot to bind to. A photo with no host is
 * skipped by the media drain silently and forever.
 */
it('offers no route to the camera outside the spot flow', () => {
  renderScreen()

  expect(screen.queryByLabelText('Add photos')).toBeNull()
})

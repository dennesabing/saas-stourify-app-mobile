import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Linking } from 'react-native'
import PermissionsScreen from '@/features/onboarding/screens/PermissionsScreen'
import { createTestDatabase } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'

const UNDECIDED = { status: 'undetermined', granted: false, canAskAgain: true }
const GRANTED = { status: 'granted', granted: true, canAskAgain: true }
const REFUSED_FOR_GOOD = { status: 'denied', granted: false, canAskAgain: false }

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
}))

jest.mock('expo-camera', () => ({
  Camera: {
    getCameraPermissionsAsync: jest.fn(),
    requestCameraPermissionsAsync: jest.fn(),
  },
}))

import * as Location from 'expo-location'
import { Camera } from 'expo-camera'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <PermissionsScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue(UNDECIDED)
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(GRANTED)
  ;(Camera.getCameraPermissionsAsync as jest.Mock).mockResolvedValue(UNDECIDED)
  ;(Camera.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue(GRANTED)
})

it('explains each permission before asking for any of them', async () => {
  renderScreen()

  expect(screen.getByText('Enable the essentials')).toBeTruthy()
  expect(screen.getByText('Location')).toBeTruthy()
  expect(screen.getByText('Camera')).toBeTruthy()
  expect(await screen.findByLabelText('Allow location')).toBeTruthy()
  expect(screen.getByLabelText('Allow camera')).toBeTruthy()

  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
  expect(Camera.requestCameraPermissionsAsync).not.toHaveBeenCalled()
})

/**
 * The design draws a Notifications row. Stourify sends no notifications and has
 * no push service, so asking for the permission would be asking for something
 * the app never uses — the thing a store review flags (STOURIFY-287).
 */
it('does not ask for notifications, which the app never sends', () => {
  renderScreen()

  expect(screen.queryByText('Notifications')).toBeNull()
})

it('marks the first of four steps', () => {
  renderScreen()

  expect(screen.getByLabelText('Step 1 of 4')).toBeTruthy()
})

it('asks for location from its own pill, which then reads Allowed', async () => {
  renderScreen()

  fireEvent.press(await screen.findByLabelText('Allow location'))

  await waitFor(() => expect(screen.getByLabelText('Location allowed')).toBeTruthy())
  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1)
  expect(Camera.requestCameraPermissionsAsync).not.toHaveBeenCalled()
  expect(navigation.navigate).not.toHaveBeenCalled()
})

it('asks for the camera from its own pill, which then reads Allowed', async () => {
  renderScreen()

  fireEvent.press(await screen.findByLabelText('Allow camera'))

  await waitFor(() => expect(screen.getByLabelText('Camera allowed')).toBeTruthy())
  expect(Camera.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1)
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
})

it('keeps the pill on Allow when the phone says no', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'denied',
    granted: false,
    canAskAgain: true,
  })
  renderScreen()

  fireEvent.press(await screen.findByLabelText('Allow location'))

  await waitFor(() => expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled())
  expect(await screen.findByLabelText('Allow location')).toBeTruthy()
  expect(screen.queryByLabelText('Location allowed')).toBeNull()
})

it('shows Allowed straight away for a permission the phone already granted', async () => {
  ;(Camera.getCameraPermissionsAsync as jest.Mock).mockResolvedValue(GRANTED)

  renderScreen()

  expect(await screen.findByLabelText('Camera allowed')).toBeTruthy()
  expect(screen.getByLabelText('Allow location')).toBeTruthy()
})

/**
 * After "Don't ask again" the phone answers every request with an instant no,
 * without showing anything. A pill that asked anyway would look dead, so it
 * opens the app's system settings instead — the only place left to say yes.
 */
it('opens system settings once the phone has refused for good', async () => {
  ;(Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue(REFUSED_FOR_GOOD)
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)

  renderScreen()

  await waitFor(() => expect(Location.getForegroundPermissionsAsync).toHaveBeenCalled())
  fireEvent.press(screen.getByLabelText('Allow location'))

  await waitFor(() => expect(openSettings).toHaveBeenCalled())
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()

  openSettings.mockRestore()
})

it('Continue advances to Interests without asking for anything', () => {
  renderScreen()

  fireEvent.press(screen.getByText('Continue'))

  expect(navigation.navigate).toHaveBeenCalledWith('Interests')
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
  expect(Camera.requestCameraPermissionsAsync).not.toHaveBeenCalled()
})

it('Skip advances to Interests without asking for anything', () => {
  renderScreen()

  fireEvent.press(screen.getByText('Skip'))

  expect(navigation.navigate).toHaveBeenCalledWith('Interests')
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
  expect(Camera.requestCameraPermissionsAsync).not.toHaveBeenCalled()
})

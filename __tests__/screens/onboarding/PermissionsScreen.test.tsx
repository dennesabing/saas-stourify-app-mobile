import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import PermissionsScreen from '@/features/onboarding/screens/PermissionsScreen'
import { createTestDatabase } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}))

import * as Location from 'expo-location'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <PermissionsScreen navigation={navigation} route={{} as any} />
    </TestProviders>,
  )
}

beforeEach(() => jest.clearAllMocks())

it('explains why location is wanted before requesting it', () => {
  renderScreen()

  expect(screen.getByText(/nearby spots/i)).toBeTruthy()
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
})

it('requests the OS permission and advances to Interests', async () => {
  renderScreen()

  fireEvent.press(screen.getByText('Enable location'))

  await waitFor(() => {
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled()
    expect(navigation.navigate).toHaveBeenCalledWith('Interests')
  })
})

it('Skip advances without ever requesting the permission', () => {
  renderScreen()

  fireEvent.press(screen.getByText('Skip'))

  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
  expect(navigation.navigate).toHaveBeenCalledWith('Interests')
})

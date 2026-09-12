import { fireEvent, render, screen } from '@testing-library/react-native'
import WelcomeScreen from '@/features/auth/screens/WelcomeScreen'

const navigation = { navigate: jest.fn() } as any
const route = {} as any

beforeEach(() => jest.clearAllMocks())

/**
 * Welcome, as the Auth & Entry design draws it (STOURIFY-286). The two buttons
 * are the only things on it that do anything, so they are what is pinned.
 */
it('shows the wordmark, the headline and the pitch', () => {
  render(<WelcomeScreen navigation={navigation} route={route} />)

  expect(screen.getByText('Stourify')).toBeTruthy()
  expect(screen.getByText('Discover your next adventure')).toBeTruthy()
  expect(screen.getByText(/Real spots, shared by explorers who actually go there/)).toBeTruthy()
})

it('starts sign-up from "Get started"', () => {
  render(<WelcomeScreen navigation={navigation} route={route} />)

  fireEvent.press(screen.getByText('Get started'))
  expect(navigation.navigate).toHaveBeenCalledWith('Register')
})

it('sends someone with an account to log in', () => {
  render(<WelcomeScreen navigation={navigation} route={route} />)

  fireEvent.press(screen.getByText('I already have an account'))
  expect(navigation.navigate).toHaveBeenCalledWith('Login')
})

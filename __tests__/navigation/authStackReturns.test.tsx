import type { ComponentType } from 'react'
import { Text } from 'react-native'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import LoginScreen from '@/features/auth/screens/LoginScreen'
import RegisterScreen from '@/features/auth/screens/RegisterScreen'
import ResetPasswordScreen from '@/features/auth/screens/ResetPasswordScreen'
import type { RootStackParamList } from '@/shared/navigation/types'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

/**
 * STOURIFY-305: the sign-in links go BACK to a screen already in the pile.
 *
 * The screens sit in a stack, like cards on a table. "Log in" on Sign Up should
 * take you down to the Log In card already there, not lay a second one on top.
 * React Navigation 7 changed `navigate(name)` to push a new copy unless that
 * screen is the top card; `popTo(name)` is the call that goes back down, and
 * when there is no such card it swaps the current one for it.
 *
 * Why a real navigator and not the mocked `navigation` the screen tests use: a
 * mock records WHICH method was called and nothing about what the router does
 * with it. The bug is in the second half — `navigate('Login')` looked right in
 * every mocked test while stacking duplicates on the phone. So each case below
 * starts the real stack from a chosen pile, taps the link, and reads the pile.
 */

jest.mock('@/shared/api/auth', () => ({
  login: jest.fn(),
  register: jest.fn(),
  getAuthConfig: jest.fn(async () => ({ invitation_only: false, registration_enabled: true })),
  resetPassword: jest.fn(async () => ({ message: 'ok' })),
}))

jest.mock('@/sync/session', () => ({ onLogin: jest.fn(async () => undefined) }))

jest.mock('@/shared/store/auth', () => ({
  useAuthStore: () => ({ setToken: jest.fn(), setUser: jest.fn() }),
}))

type AuthRoute = 'Welcome' | 'Login' | 'Register' | 'ForgotPassword' | 'ResetPassword'

const AUTH_ROUTES: AuthRoute[] = ['Welcome', 'Login', 'Register', 'ForgotPassword', 'ResetPassword']

const REAL: Partial<Record<AuthRoute, ComponentType<any>>> = {
  Login: LoginScreen,
  Register: RegisterScreen,
  ResetPassword: ResetPasswordScreen,
}

/**
 * Every screen except the one under test is a stub that prints its name. Two
 * real screens in one pile would both be mounted, and "Log in" is a button on
 * one and a link on the other — a query could press the wrong one.
 */
function Stub({ route }: { route: { name: string } }) {
  return <Text>{`stub:${route.name}`}</Text>
}

const Stack = createNativeStackNavigator<RootStackParamList>()

function renderPile(subject: AuthRoute, pile: AuthRoute[]): () => string[] {
  const ref = createNavigationContainerRef<RootStackParamList>()

  render(
    <TestProviders database={createTestDatabase()}>
      <NavigationContainer
        ref={ref}
        initialState={{
          index: pile.length - 1,
          routes: pile.map((name) => ({
            name,
            params: name === 'ResetPassword' ? { email: 'a@b.com' } : undefined,
          })),
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {AUTH_ROUTES.map((name) => (
            <Stack.Screen
              key={name}
              name={name}
              component={(name === subject ? REAL[name] : Stub) as ComponentType<any>}
            />
          ))}
        </Stack.Navigator>
      </NavigationContainer>
    </TestProviders>,
  )

  return () => ref.getRootState().routes.map((route) => route.name)
}

describe('Sign Up → "Log in"', () => {
  it('returns to the Log In already underneath instead of stacking a second one', () => {
    const pile = renderPile('Register', ['Welcome', 'Login', 'Register'])

    fireEvent.press(screen.getByText('Log in'))

    expect(pile()).toEqual(['Welcome', 'Login'])
  })

  it('still reaches Log In when there is none underneath, by swapping Sign Up for it', () => {
    const pile = renderPile('Register', ['Welcome', 'Register'])

    fireEvent.press(screen.getByText('Log in'))

    expect(pile()).toEqual(['Welcome', 'Login'])
  })
})

describe('Log In → "Sign up"', () => {
  it('returns to the Sign Up already underneath instead of stacking a second one', () => {
    const pile = renderPile('Login', ['Welcome', 'Register', 'Login'])

    fireEvent.press(screen.getByText('Sign up'))

    expect(pile()).toEqual(['Welcome', 'Register'])
  })

  it('still reaches Sign Up when there is none underneath, by swapping Log In for it', () => {
    const pile = renderPile('Login', ['Welcome', 'Login'])

    fireEvent.press(screen.getByText('Sign up'))

    expect(pile()).toEqual(['Welcome', 'Register'])
  })
})

describe('Reset password → Log In, once the password is changed', () => {
  function submitReset() {
    fireEvent.changeText(screen.getByPlaceholderText('Paste the code from your email'), 'tok-123')
    fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'newpassword1')
    fireEvent.changeText(screen.getByPlaceholderText('Repeat your password'), 'newpassword1')
    fireEvent.press(screen.getByText('Reset password'))
  }

  it('returns to the Log In underneath, clearing Forgot password on the way', async () => {
    const pile = renderPile('ResetPassword', [
      'Welcome',
      'Login',
      'ForgotPassword',
      'ResetPassword',
    ])

    submitReset()

    await waitFor(() => expect(pile()).toEqual(['Welcome', 'Login']))
  })

  it('still reaches Log In when there is none underneath', async () => {
    const pile = renderPile('ResetPassword', ['Welcome', 'ResetPassword'])

    submitReset()

    await waitFor(() => expect(pile()).toEqual(['Welcome', 'Login']))
  })
})

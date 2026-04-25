import { useAuthStore } from '../../src/shared/store/auth'

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
}))

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null })
})

test('setToken stores the token', () => {
  useAuthStore.getState().setToken('abc123')
  expect(useAuthStore.getState().token).toBe('abc123')
})

test('setUser stores the user', () => {
  const user = { id: '1', name: 'Ana', email: 'ana@test.com', uuid: 'uuid-1' }
  useAuthStore.getState().setUser(user)
  expect(useAuthStore.getState().user?.name).toBe('Ana')
})

test('clearAuth resets token and user', () => {
  useAuthStore.setState({ token: 'tok', user: { id: '1', name: 'Ana', email: '', uuid: '' } })
  useAuthStore.getState().clearAuth()
  expect(useAuthStore.getState().token).toBeNull()
  expect(useAuthStore.getState().user).toBeNull()
})

import { render, waitFor } from '@testing-library/react-native'

const mockLaunchImageLibraryAsync = jest.fn()
const mockRequestMediaLibraryPermissionsAsync = jest.fn()

jest.mock('expo-image-picker', () => ({
  __esModule: true,
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissionsAsync(),
  MediaTypeOptions: { All: 'All', Images: 'Images', Videos: 'Videos' },
}))

import MediaPickerScreen from '@/features/social/screens/MediaPickerScreen'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = { key: 'MediaPicker', name: 'MediaPicker' } as any

beforeEach(() => {
  jest.clearAllMocks()
  mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true })
  mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null })
})

/**
 * A video can carry the place it was recorded, and nothing in the app can
 * remove that yet — or play a video back. So New Post offers photos only
 * (STOURIFY-45). If this ever reads `All` again, the privacy policy's promise
 * that the app does not accept videos is false.
 */
it('asks the gallery for images only, never videos', async () => {
  render(<MediaPickerScreen navigation={navigation} route={route} />)

  await waitFor(() => expect(mockLaunchImageLibraryAsync).toHaveBeenCalledTimes(1))

  expect(mockLaunchImageLibraryAsync.mock.calls[0][0].mediaTypes).toEqual(['images'])
})

it('hands the picked photos to the composer', async () => {
  mockLaunchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///shot.png', mimeType: 'image/png', fileName: 'shot.png' }],
  })

  render(<MediaPickerScreen navigation={navigation} route={route} />)

  await waitFor(() =>
    expect(navigation.navigate).toHaveBeenCalledWith('PostCompose', {
      mediaAssets: [{ uri: 'file:///shot.png', type: 'image/png', fileName: 'shot.png' }],
    }),
  )
})

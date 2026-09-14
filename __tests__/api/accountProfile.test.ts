jest.mock('@/shared/api/client', () => ({
  client: { put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}))

import { client } from '@/shared/api/client'
import { removeAvatar, updateDisplayName, uploadAvatar } from '@/shared/api/account'

/**
 * Your photo and your display name belong to the platform account, not to the
 * explorer profile (STOURIFY-307). They are written at `PUT /me` and
 * `POST|DELETE /me/avatar` — never at `PATCH /profile`, which silently drops a
 * `name`.
 *
 * `UserProfileController::updateAvatar` validates `avatar` as a required image,
 * so the part name is the whole contract: send the file under any other name
 * and the answer is a 422 saying the photo is missing while one is plainly
 * attached.
 */
beforeEach(() => jest.clearAllMocks())

it('saves a display name as a PUT to /me carrying only the name', async () => {
  ;(client.put as jest.Mock).mockResolvedValue({ data: { data: { name: 'Ramil S.' } } })

  await expect(updateDisplayName('Ramil S.')).resolves.toEqual({ name: 'Ramil S.' })
  expect(client.put).toHaveBeenCalledWith('/me', { name: 'Ramil S.' })
})

it('uploads the photo as one multipart part named "avatar" and answers the new URL', async () => {
  const append = jest.spyOn(FormData.prototype, 'append')
  ;(client.post as jest.Mock).mockResolvedValue({
    data: { data: { profile_photo_url: 'https://cdn.example/me-medium.jpg' } },
  })

  const file = { uri: 'file:///cache/avatar-1.jpg', name: 'avatar-1.jpg', type: 'image/jpeg' }
  await expect(uploadAvatar(file)).resolves.toBe('https://cdn.example/me-medium.jpg')

  const [path, body, config] = (client.post as jest.Mock).mock.calls[0]
  expect(path).toBe('/me/avatar')
  expect(body).toBeInstanceOf(FormData)
  expect(append).toHaveBeenCalledWith('avatar', file)
  // The client's default Content-Type is JSON, and axios serialises a FormData
  // body AS JSON when told so — the file would arrive as the text of an object.
  expect(config.headers['Content-Type']).toBe('multipart/form-data')

  append.mockRestore()
})

it('removes the photo with a DELETE to /me/avatar', async () => {
  ;(client.delete as jest.Mock).mockResolvedValue({ data: { data: { profile_photo_url: null } } })

  await removeAvatar()

  expect(client.delete).toHaveBeenCalledWith('/me/avatar')
})

it('lets a refusal through to the screen rather than swallowing it', async () => {
  const refusal = new Error('refused')
  ;(client.put as jest.Mock).mockRejectedValue(refusal)

  await expect(updateDisplayName('x')).rejects.toBe(refusal)
})

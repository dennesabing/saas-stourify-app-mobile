import * as ImagePicker from 'expo-image-picker'
import { File, Paths } from 'expo-file-system'
import type { AvatarUpload } from '@/shared/api/account'
import { stripImageMetadata } from '@/shared/media/stripImageMetadata'

export type AvatarPick =
  { kind: 'picked'; file: AvatarUpload } | { kind: 'cancelled' } | { kind: 'denied' }

/**
 * Let someone choose a new profile photo, and hand back a copy of it that is
 * safe to send (STOURIFY-307).
 *
 * **The copy is the point.** A photo straight out of a camera roll carries a
 * hidden label with, often, the coordinates it was taken at — and a profile
 * photo is very often a selfie taken at home. The app strips that label on the
 * phone for every spot and post photo (STOURIFY-40), and this is the third door
 * a photo leaves by. The server strips JPEGs too (STOURIFY-77), but passes a
 * PNG through untouched on purpose, so it cannot be the only guard.
 *
 * React Native's `FormData` sends a file by its path and cannot send bytes held
 * in memory, so the stripped bytes are written to the cache folder and that
 * file is what gets uploaded. The system may clear the cache folder whenever it
 * likes; nothing needs this copy once the upload has answered.
 *
 * One photo, photos only — the same rule as the post picker (STOURIFY-45: a
 * video can carry a location in a box the stripper cannot reach).
 */
export async function pickAvatar(): Promise<AvatarPick> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (status !== 'granted') return { kind: 'denied' }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 0.8,
  })
  if (result.canceled || !result.assets || result.assets.length === 0) return { kind: 'cancelled' }

  const asset = result.assets[0]
  const type = asset.mimeType ?? 'image/jpeg'
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  const name = `avatar-${Date.now()}.${extension}`

  const stripped = stripImageMetadata(await new File(asset.uri).bytes())
  const copy = new File(Paths.cache, name)
  copy.write(stripped)

  return { kind: 'picked', file: { uri: copy.uri, name, type } }
}

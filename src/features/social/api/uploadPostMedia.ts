import { File } from 'expo-file-system'
import { attachMedia, putFile, requestUploadUrl } from '@/shared/api/media'

/**
 * The morph alias a post's photos are attached to — `Post::morphAlias()`.
 *
 * An alias, never an FQCN: the API deliberately never leaks a `Modules\…` class
 * name, and `MorphTypeRegistry` resolves the alias before it checks whether the
 * host is attachable.
 */
export const POST_MEDIA_HOST_TYPE = 'stourify_post'

/** What `MediaPicker` hands `PostCompose` through the route params. */
export interface PostMediaAsset {
  uri: string
  type?: string
  fileName?: string
}

/**
 * Uploads a composed post's photos through the platform's presign flow.
 *
 * This screen used to append the photos as `media[0]`, `media[1]`, … multipart
 * parts on `POST /posts`. `PostStoreRequest` validates no such key, and Laravel
 * discards unvalidated input without erroring — so every post ever composed with
 * photos was created with none, silently (STOURIFY-18).
 *
 * The real path is the one the platform already ships and the one the media
 * outbox drains: presign → PUT the bytes straight to storage → attach. Bytes
 * never pass through the PHP request cycle. `sync/mediaDrain.ts` performs the
 * identical three steps for the offline queue; the only difference here is that
 * a post has no local WatermelonDB row to wait on, so it runs inline.
 *
 * Rejects on the first failure rather than continuing: the caller publishes only
 * once every attach resolved, and a post that goes live missing half its photos
 * is worse than one left as a draft `publish` can finish later.
 */
export async function uploadPostMedia(
  postUuid: string,
  assets: PostMediaAsset[],
): Promise<void> {
  for (const [index, asset] of assets.entries()) {
    const filename = asset.fileName ?? `photo_${index}.jpg`
    const contentType = asset.type ?? 'image/jpeg'
    const file = new File(asset.uri)
    const bytes = await file.bytes()

    const presigned = await requestUploadUrl({
      filename,
      contentType,
      // Advisory only — the server enforces its ceiling at attach, once the
      // object exists and its real size is knowable.
      size: file.size ?? bytes.length,
      modelType: POST_MEDIA_HOST_TYPE,
      modelUuid: postUuid,
    })

    await putFile(presigned.url, presigned.headers, bytes)

    await attachMedia({
      key: presigned.key,
      name: filename,
      modelType: POST_MEDIA_HOST_TYPE,
      modelUuid: postUuid,
    })
  }
}

import axios from 'axios'
import { client } from './client'
import type { Media } from './types'

export interface PresignedUpload {
  key: string
  url: string
  headers: Record<string, string>
  expires_at: string
}

export interface RequestUploadUrlInput {
  filename: string
  contentType?: string
  size?: number
  /** Morph alias, e.g. 'stourify_spot' — never an FQCN. */
  modelType: string
  modelUuid: string
}

/**
 * `POST /media/upload-url` — must be called at DRAIN time, never at capture
 * time. The signed URL expires in 15 minutes
 * (`PresignedUploadService::EXPIRY_MINUTES`); one minted while offline is
 * guaranteed dead by the time it would be used.
 */
export async function requestUploadUrl(input: RequestUploadUrlInput): Promise<PresignedUpload> {
  const res = await client.post('/media/upload-url', {
    filename: input.filename,
    content_type: input.contentType,
    size: input.size,
    model_type: input.modelType,
    model_uuid: input.modelUuid,
  })
  return res.data.data
}

/**
 * PUTs raw bytes to the presigned S3 URL, replaying `headers` verbatim (they
 * carry the declared `ContentType` the signature covers).
 *
 * Deliberately bypasses `axios.put` on the shared `client` instance: `url`
 * is an absolute S3 URL, and `client`'s request interceptor unconditionally
 * injects the app's Sanctum bearer token and its fixed `baseURL`. A
 * presigned PUT is rejected for carrying a header the signature didn't
 * cover, so this is a bare `axios` call — no interceptors, no `baseURL`.
 */
export async function putFile(
  url: string,
  headers: Record<string, string>,
  body: ArrayBuffer | Uint8Array | Blob | string,
): Promise<void> {
  await axios.put(url, body, { headers })
}

export interface AttachMediaInput {
  key: string
  /**
   * A token the CLIENT mints once per photo and replays on every retry, so the
   * server can recognise a repeated attach and return the row it already made
   * instead of creating a second one.
   *
   * It cannot be `key`: every attempt presigns a fresh object, so `key` is
   * different each time. See STOURIFY-28.
   */
  idempotencyKey?: string
  name?: string
  /** Defaults server-side to 'attachments'. */
  collection?: string
  modelType: string
  modelUuid: string
}

/**
 * `POST /media/attach`. The size ceiling is enforced HERE, not at presign —
 * an over-size file 422s after its bytes are already uploaded. Callers
 * (phase 2 of the drain, Task 5) must expect and handle that rejection;
 * this function does not swallow it.
 *
 * This call is at-least-once and cannot be made otherwise: a response lost on
 * the way back is indistinguishable from a request that never arrived, so the
 * caller must retry and pass `idempotencyKey` to keep the retry harmless.
 */
export async function attachMedia(input: AttachMediaInput): Promise<Media> {
  const res = await client.post('/media/attach', {
    key: input.key,
    idempotency_key: input.idempotencyKey,
    name: input.name,
    collection: input.collection,
    model_type: input.modelType,
    model_uuid: input.modelUuid,
  })
  return res.data.data
}

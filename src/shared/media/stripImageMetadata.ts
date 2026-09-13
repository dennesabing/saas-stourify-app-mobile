/**
 * Removes the private metadata a camera writes into a photo, without touching
 * the picture itself.
 *
 * ## Why this exists
 *
 * A photo file is two things at once: the picture, and a small label stuck to
 * it. The camera writes the label — when the shot was taken, what phone took
 * it, and, if location services were on, the exact latitude and longitude of
 * the spot the photographer was standing on. Nobody sees the label when they
 * look at the picture, which is exactly what makes it dangerous. In a
 * location-sharing app the photos most likely to hurt someone are the ones they
 * take at home and post without tagging a place: the picture shows a kitchen,
 * the label says which kitchen.
 *
 * Stourify's photos go straight from the phone to public object storage, and the
 * original file is served at a public URL alongside its thumbnails. So the only
 * place that can guarantee the coordinates never become public is the phone,
 * before the bytes leave it — which is this file (STOURIFY-40, and PNG since
 * STOURIFY-45).
 *
 * ## How it works, and why there is no image library involved
 *
 * A JPEG is a train. Two bytes of engine ("start of image"), then a series of
 * labelled carriages, then the picture data. Each carriage says what it is and
 * how long it is, and **the metadata rides in carriages of its own** — nothing
 * in the picture data refers to them.
 *
 * A PNG is the same idea in a different shape: a stack of index cards, each
 * with a length, a four-letter name, its contents and a checksum over its own
 * name and contents. The label rides on cards of its own there too.
 *
 * So the whole job is to copy the train, or the stack, and leave some pieces
 * out. No decoding, no re-encoding, no native image library, and therefore no
 * rebuild of the packaged development client. It is also lossless in a way a
 * re-encode could never be: the picture bytes that come out are the exact bytes
 * that went in.
 *
 * The alternative was `expo-image-manipulator`, which re-encodes the image and
 * drops the metadata as a side effect. It would have worked. It lost because it
 * is a native module that is not installed — adding one means building and
 * shipping a new development client before any test result can be trusted — and
 * because re-encoding degrades every photo slightly to achieve something that
 * copying achieves exactly.
 *
 * The server runs the same two walks again as a backstop
 * (`saas-boilerplate/app/Services/Media/JpegMetadataStripper.php` and
 * `PngMetadataStripper.php`). The drop lists match piece for piece; change one
 * and change the other.
 */

/**
 * Thrown when the file claims to be a JPEG or a PNG but its structure cannot be
 * walked.
 *
 * Failing is deliberate, and it is the one design decision here worth arguing
 * about. The tempting alternative is to hand back the original bytes when the
 * walk goes wrong, so that no photo is ever un-uploadable. That is backwards for
 * a privacy control: the bytes it would wave through are precisely the ones
 * nothing was able to inspect. A visible "that photo could not be saved" is a
 * far better outcome than a silent upload of someone's home coordinates.
 */
export class MetadataStripError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MetadataStripError'
  }
}

const MARKER_PREFIX = 0xff

/** `FF D8` — the two bytes every JPEG opens with. */
const START_OF_IMAGE = 0xd8

/** `FF DA` — after this carriage's header, the rest of the file is picture data. */
const START_OF_SCAN = 0xda

/** `FF D9` — end of image. */
const END_OF_IMAGE = 0xd9

/** `FF 01`, and `FF D0`–`FF D7`: markers that carry no length and no payload. */
const TEMPORARY = 0x01
const RESTART_FIRST = 0xd0
const RESTART_LAST = 0xd7

/**
 * The carriages that get uncoupled.
 *
 * - `APP1` (`0xE1`) holds EXIF — the GPS coordinates, the capture timestamp, the
 *   device make, model and sometimes serial number — and also XMP, which can
 *   repeat the same location in a different notation.
 * - `APP13` (`0xED`) holds the Photoshop resource block, whose IPTC records have
 *   their own location fields.
 * - `COM` (`0xFE`) is a free-text comment. Some software writes a location into
 *   it in plain words.
 *
 * Everything else is left alone on purpose. `APP0` carries the pixel density,
 * `APP2` the colour profile and `APP14` Adobe's colour-transform flag: dropping
 * those would change how the picture *looks*, which is a different concern from
 * this one and not an improvement.
 */
const DROPPED_MARKERS: ReadonlySet<number> = new Set([0xe1, 0xed, 0xfe])

/** `89 50 4E 47 0D 0A 1A 0A` — the eight bytes every PNG opens with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** The last card in every PNG. */
const PNG_END = 'IEND'

/**
 * The PNG cards that get left out.
 *
 * - `eXIf` holds an EXIF block — the same one a JPEG's `APP1` carries, GPS and
 *   all.
 * - `iTXt` holds international text, which is where XMP lives, and XMP can
 *   repeat the location.
 * - `tEXt` and `zTXt` hold plain and compressed text — the PNG `COM`.
 * - `tIME` holds a timestamp, part of the label the privacy policy promises to
 *   remove.
 *
 * Everything else stays: `iCCP`, `sRGB`, `gAMA`, `cHRM` and `pHYs` decide how
 * the picture looks, and an animated PNG's frame cards are the picture.
 */
const DROPPED_PNG_CHUNKS: ReadonlySet<string> = new Set(['eXIf', 'iTXt', 'tEXt', 'zTXt', 'tIME'])

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === MARKER_PREFIX && bytes[1] === START_OF_IMAGE
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)
}

function carriesNoPayload(marker: number): boolean {
  return (
    marker === TEMPORARY ||
    marker === START_OF_IMAGE ||
    marker === END_OF_IMAGE ||
    (marker >= RESTART_FIRST && marker <= RESTART_LAST)
  )
}

/**
 * Every run of bytes worth keeping, collected as [start, end) pairs into the
 * input rather than copied one piece at a time — a photo is megabytes and there
 * is no reason to touch them more than once.
 */
class KeptRuns {
  private readonly runs: Array<[number, number]> = []
  private length = 0

  keep(from: number, to: number): void {
    const last = this.runs[this.runs.length - 1]
    if (last !== undefined && last[1] === from) {
      last[1] = to
    } else {
      this.runs.push([from, to])
    }
    this.length += to - from
  }

  copyFrom(bytes: Uint8Array): Uint8Array {
    const output = new Uint8Array(this.length)
    let written = 0
    for (const [from, to] of this.runs) {
      output.set(bytes.subarray(from, to), written)
      written += to - from
    }
    return output
  }
}

/**
 * Returns the same picture with its metadata removed.
 *
 * JPEG and PNG are handled. Anything else comes back byte-for-byte unchanged,
 * and that is a known limit rather than an oversight: a HEIC has its own
 * container, and a video can hold coordinates in its own metadata box. The app
 * does not offer videos at all for that reason (STOURIFY-45), and the privacy
 * policy names what is still not covered.
 *
 * Calling this twice is safe and costs nothing the second time — a file with no
 * metadata has none to remove, and the output equals the input.
 */
export function stripImageMetadata(bytes: Uint8Array): Uint8Array {
  if (isJpeg(bytes)) return stripJpeg(bytes)
  if (isPng(bytes)) return stripPng(bytes)
  return bytes
}

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const kept = new KeptRuns()
  kept.keep(0, 2)

  let cursor = 2

  while (cursor < bytes.length) {
    if (bytes[cursor] !== MARKER_PREFIX) {
      throw new MetadataStripError(
        `Expected a marker at byte ${cursor}, found 0x${bytes[cursor].toString(16)}.`,
      )
    }

    // A run of `FF` bytes is legal padding before a marker. Walk past it, but
    // keep the padding so the output stays a faithful copy.
    let markerAt = cursor
    while (markerAt + 1 < bytes.length && bytes[markerAt + 1] === MARKER_PREFIX) {
      markerAt += 1
    }

    if (markerAt + 1 >= bytes.length) {
      throw new MetadataStripError('The file ends where a marker should be — it is truncated.')
    }

    const marker = bytes[markerAt + 1]

    if (marker === START_OF_SCAN) {
      // The picture data starts after this carriage's header and runs to the end
      // of the file, with no further lengths to trust. Copy the remainder as-is;
      // this is the byte-for-byte guarantee.
      kept.keep(cursor, bytes.length)
      break
    }

    if (carriesNoPayload(marker)) {
      kept.keep(cursor, markerAt + 2)
      cursor = markerAt + 2
      continue
    }

    if (markerAt + 3 >= bytes.length) {
      throw new MetadataStripError(
        `The block at byte ${markerAt} has no length — the file is truncated.`,
      )
    }

    const length = (bytes[markerAt + 2] << 8) | bytes[markerAt + 3]
    if (length < 2) {
      throw new MetadataStripError(
        `The block at byte ${markerAt} declares an impossible length of ${length}.`,
      )
    }

    const end = markerAt + 2 + length
    if (end > bytes.length) {
      throw new MetadataStripError(
        `The block at byte ${markerAt} claims to run to ${end}, past the end of a ${bytes.length}-byte file.`,
      )
    }

    if (!DROPPED_MARKERS.has(marker)) {
      kept.keep(cursor, end)
    } else if (markerAt > cursor) {
      // Drop the carriage but not the padding that preceded it.
      kept.keep(cursor, markerAt)
    }

    cursor = end
  }

  return kept.copyFrom(bytes)
}

/**
 * Walks a PNG card by card, leaving out the label cards.
 *
 * Each card's checksum covers only that card, so removing a whole card needs no
 * checksum recalculated. The walk stops after the end card, and anything after
 * it is dropped: every reader ignores those bytes, which is exactly what makes
 * them a place to hide something.
 */
function stripPng(bytes: Uint8Array): Uint8Array {
  const kept = new KeptRuns()
  kept.keep(0, PNG_SIGNATURE.length)

  let cursor = PNG_SIGNATURE.length

  for (;;) {
    // Length (4) + name (4) + checksum (4) is the smallest card there is.
    if (cursor + 12 > bytes.length) {
      throw new MetadataStripError(
        `The file ends at byte ${cursor} without an end card — it is truncated.`,
      )
    }

    // Multiplied rather than shifted: `<< 24` on a byte of 0x80 or more goes
    // negative in JavaScript's 32-bit signed arithmetic.
    const declared =
      bytes[cursor] * 0x1000000 +
      (bytes[cursor + 1] << 16) +
      (bytes[cursor + 2] << 8) +
      bytes[cursor + 3]
    const name = String.fromCharCode(...bytes.subarray(cursor + 4, cursor + 8))
    const end = cursor + 12 + declared

    if (!/^[A-Za-z]{4}$/.test(name)) {
      throw new MetadataStripError(`The card at byte ${cursor} has no readable name.`)
    }

    if (end > bytes.length) {
      throw new MetadataStripError(
        `The ${name} card at byte ${cursor} claims to run to ${end}, past the end of a ${bytes.length}-byte file.`,
      )
    }

    if (!DROPPED_PNG_CHUNKS.has(name)) {
      kept.keep(cursor, end)
    }

    cursor = end

    if (name === PNG_END) break
  }

  return kept.copyFrom(bytes)
}

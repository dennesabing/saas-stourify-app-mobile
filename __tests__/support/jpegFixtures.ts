/**
 * JPEG bytes built by hand, for testing what `stripImageMetadata` removes.
 *
 * ## Why this file exists at all
 *
 * The thing being tested is "a photo that carries the coordinates it was taken
 * at no longer carries them". A file with no coordinates in it also has none
 * afterwards — so a test fed an ordinary picture passes without proving
 * anything. The fixture has to genuinely contain a GPS tag, and the cheapest
 * honest way to get one is to write the bytes.
 *
 * ## What a JPEG actually is
 *
 * Think of a train. The engine is a two-byte "start of image" marker, then a
 * series of carriages, then the picture data. Each carriage is labelled: two
 * bytes naming what it is (`FF` followed by a marker number), two bytes saying
 * how long it is, then its contents. Metadata rides in its own carriages —
 * `APP1` carries EXIF, `APP13` carries the Photoshop/IPTC block, `COM` carries
 * free text. Nothing in the picture data points at them.
 *
 * That is the whole reason the metadata can be removed without touching the
 * picture: you are uncoupling carriages, not repainting the train.
 */

/** `FF D8` — start of image. Every JPEG opens with it. */
export const SOI = [0xff, 0xd8]

/** `FF DA` — start of scan. Everything after its header is picture data. */
export const SOS_MARKER = 0xda

/**
 * Marker numbers, by the names the JPEG specification gives them. `APPn` is
 * `0xE0 + n`, so EXIF's `APP1` is `0xE1`.
 */
export const MARKER = {
  APP0_JFIF: 0xe0,
  APP1_EXIF: 0xe1,
  APP2_ICC: 0xe2,
  APP13_PHOTOSHOP: 0xed,
  APP14_ADOBE: 0xee,
  COM: 0xfe,
  SOF0: 0xc0,
  SOS: 0xda,
  EOI: 0xd9,
} as const

function u16be(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff]
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]
}

function u16le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff]
}

/**
 * One labelled carriage: `FF <marker> <length> <payload>`. The length counts
 * itself, which is why it is `payload + 2` and not `payload`.
 */
export function segment(marker: number, payload: number[]): number[] {
  return [0xff, marker, ...u16be(payload.length + 2), ...payload]
}

/**
 * The contents of an EXIF `APP1` carriage holding a latitude and a longitude.
 *
 * Inside the carriage sits a miniature file format of its own — TIFF — which is
 * a table of tagged entries where anything longer than four bytes is stored
 * elsewhere in the block and referenced by its distance from the start. That
 * indirection is the only fiddly part, so the layout is fixed and the offsets
 * are written out rather than computed:
 *
 * ```
 *   0   TIFF header            8 bytes  ("II", magic 42, "first table is at 8")
 *   8   main table           18 bytes  (1 entry: "the GPS table is at 26")
 *  26   GPS table            54 bytes  (4 entries: lat, its N/S, lon, its E/W)
 *  80   latitude  values     24 bytes  (degrees, minutes, seconds as fractions)
 * 104   longitude values     24 bytes
 * ```
 *
 * Everything is little-endian, which is what the leading `II` declares.
 */
function exifPayloadWithGps(): number[] {
  const GPS_IFD_OFFSET = 26
  const LATITUDE_VALUES_OFFSET = 80
  const LONGITUDE_VALUES_OFFSET = 104

  const TYPE_ASCII = 2
  const TYPE_LONG = 4
  const TYPE_RATIONAL = 5

  const entry = (tag: number, type: number, count: number, value: number[]): number[] => [
    ...u16le(tag),
    ...u16le(type),
    ...u32le(count),
    ...value,
  ]

  /** Degrees, minutes and seconds, each as a fraction of two 32-bit numbers. */
  const dms = (degrees: number, minutes: number, seconds: number): number[] => [
    ...u32le(degrees), ...u32le(1),
    ...u32le(minutes), ...u32le(1),
    ...u32le(seconds), ...u32le(1),
  ]

  const tiffHeader = [0x49, 0x49, 0x2a, 0x00, ...u32le(8)]

  const mainTable = [
    ...u16le(1),
    ...entry(0x8825, TYPE_LONG, 1, u32le(GPS_IFD_OFFSET)),
    ...u32le(0),
  ]

  const gpsTable = [
    ...u16le(4),
    // Four bytes or fewer live in the entry itself; "N\0" does, so it does.
    ...entry(0x0001, TYPE_ASCII, 2, [0x4e, 0x00, 0x00, 0x00]),
    ...entry(0x0002, TYPE_RATIONAL, 3, u32le(LATITUDE_VALUES_OFFSET)),
    ...entry(0x0003, TYPE_ASCII, 2, [0x45, 0x00, 0x00, 0x00]),
    ...entry(0x0004, TYPE_RATIONAL, 3, u32le(LONGITUDE_VALUES_OFFSET)),
    ...u32le(0),
  ]

  // 14°35'30"N 121°0'0"E — Manila, near enough. The exact place does not
  // matter; that it is a real, readable pair of coordinates does.
  const latitude = dms(14, 35, 30)
  const longitude = dms(121, 0, 0)

  return [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    ...tiffHeader,
    ...mainTable,
    ...gpsTable,
    ...latitude,
    ...longitude,
  ]
}

/** The `APP1` carriage, EXIF payload and all. */
export function exifGpsSegment(): number[] {
  return segment(MARKER.APP1_EXIF, exifPayloadWithGps())
}

/**
 * Stand-in picture data. Not a decodable image — nothing in these tests decodes
 * one, and a real photo would drag a binary fixture into the repository for no
 * extra assurance. What matters is that these exact bytes come out the far end
 * unchanged, which is how the tests prove nothing was re-encoded.
 */
const SCAN_DATA = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99]

/**
 * A JPEG carrying whatever carriages you name, followed by a start-of-scan
 * header, the picture data and an end-of-image marker.
 */
export function jpegWith(segments: number[][]): Uint8Array {
  return new Uint8Array([
    ...SOI,
    ...segments.flat(),
    ...segment(MARKER.SOS, [0x01, 0x01, 0x00]),
    ...SCAN_DATA,
    0xff, MARKER.EOI,
  ])
}

/** The picture data and end marker, which every strip must leave untouched. */
export function scanTail(): number[] {
  return [...SCAN_DATA, 0xff, MARKER.EOI]
}

/**
 * Lists which carriages a JPEG holds, so a test can say "the EXIF one is gone
 * and the colour-profile one is still there" without re-implementing the walk
 * it is testing. Stops at the start of scan, where labelled carriages end.
 */
export function markersOf(bytes: Uint8Array): number[] {
  const found: number[] = []
  let i = 2

  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) break
    const marker = bytes[i + 1]
    found.push(marker)
    if (marker === MARKER.SOS) break
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    i += 2 + length
  }

  return found
}

/** A PNG's opening bytes — used to prove non-JPEG input is left alone. */
export function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03])
}

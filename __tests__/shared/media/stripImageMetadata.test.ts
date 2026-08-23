import {
  MARKER,
  exifGpsSegment,
  jpegWith,
  markersOf,
  pngBytes,
  scanTail,
  segment,
} from '../../support/jpegFixtures'
import { MetadataStripError, stripImageMetadata } from '@/shared/media/stripImageMetadata'

/**
 * The fixture builder writes a real EXIF block holding real coordinates, so
 * these assertions are capable of failing. A test fed a photo with no GPS tag
 * would pass no matter what the code did, which is the one way this card could
 * ship broken while looking finished.
 */
describe('the fixture itself', () => {
  it('carries an EXIF block, so removing it is a measurable event', () => {
    expect(markersOf(jpegWith([exifGpsSegment()]))).toContain(MARKER.APP1_EXIF)
  })
})

describe('stripImageMetadata', () => {
  it('removes the EXIF block that holds the coordinates', () => {
    const stripped = stripImageMetadata(jpegWith([exifGpsSegment()]))

    expect(markersOf(stripped)).not.toContain(MARKER.APP1_EXIF)
  })

  it('leaves the picture data byte-identical — nothing is re-encoded', () => {
    const original = jpegWith([
      exifGpsSegment(),
      segment(MARKER.SOF0, [0x08, 0x00, 0x10, 0x00, 0x10, 0x01]),
    ])
    const stripped = stripImageMetadata(original)

    const tail = scanTail()
    expect(Array.from(stripped.slice(stripped.length - tail.length))).toEqual(tail)
  })

  it('also removes the Photoshop block and free-text comments, which can carry a location too', () => {
    const original = jpegWith([
      segment(MARKER.APP13_PHOTOSHOP, [0x50, 0x68, 0x6f, 0x74, 0x6f]),
      segment(MARKER.COM, [0x68, 0x69]),
    ])

    const markers = markersOf(stripImageMetadata(original))

    expect(markers).not.toContain(MARKER.APP13_PHOTOSHOP)
    expect(markers).not.toContain(MARKER.COM)
  })

  it('keeps the blocks that decide how the picture LOOKS', () => {
    // JFIF pixel density, the ICC colour profile and Adobe's colour-transform
    // marker are not private data — dropping them changes the rendered image,
    // which is not what this is for.
    const original = jpegWith([
      segment(MARKER.APP0_JFIF, [0x4a, 0x46, 0x49, 0x46, 0x00]),
      exifGpsSegment(),
      segment(MARKER.APP2_ICC, [0x49, 0x43, 0x43]),
      segment(MARKER.APP14_ADOBE, [0x41, 0x64, 0x6f, 0x62, 0x65]),
    ])

    const markers = markersOf(stripImageMetadata(original))

    expect(markers).toContain(MARKER.APP0_JFIF)
    expect(markers).toContain(MARKER.APP2_ICC)
    expect(markers).toContain(MARKER.APP14_ADOBE)
    expect(markers).not.toContain(MARKER.APP1_EXIF)
  })

  it('is idempotent, which is what lets the drain strip a second time for free', () => {
    const once = stripImageMetadata(jpegWith([exifGpsSegment()]))
    const twice = stripImageMetadata(once)

    expect(Array.from(twice)).toEqual(Array.from(once))
  })

  it('passes a non-JPEG through unchanged rather than mangling it', () => {
    const png = pngBytes()

    expect(Array.from(stripImageMetadata(png))).toEqual(Array.from(png))
  })

  it('throws on a JPEG it cannot walk, rather than returning it unstripped', () => {
    // A block claiming to be longer than the file. Returning the input here
    // would upload exactly the bytes nothing was able to verify.
    const malformed = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00, 0x00])

    expect(() => stripImageMetadata(malformed)).toThrow(MetadataStripError)
  })

  it('throws on a truncated JPEG that ends mid-block', () => {
    const truncated = new Uint8Array([0xff, 0xd8, 0xff])

    expect(() => stripImageMetadata(truncated)).toThrow(MetadataStripError)
  })
})

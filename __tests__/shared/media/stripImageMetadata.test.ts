import {
  MARKER,
  PNG_PIXELS,
  chunkContentsOf,
  chunkNamesOf,
  exifGpsSegment,
  jpegWith,
  markersOf,
  pngChunk,
  pngWith,
  pngWithGps,
  scanTail,
  segment,
  textChunk,
  tiffWithGps,
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

  it('carries a PNG eXIf card holding the GPS-bearing TIFF', () => {
    // The TIFF's GPS pointer tag, 0x8825, stored little-endian as 25 88.
    const exif = chunkContentsOf(pngWithGps(), 'eXIf')

    expect(exif).toEqual(tiffWithGps())
    expect(exif?.slice(0, 4)).toEqual([0x49, 0x49, 0x2a, 0x00])
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

  it('passes anything that is neither a JPEG nor a PNG through unchanged', () => {
    // An MP4's opening box. The app no longer offers videos (STOURIFY-45), and
    // nothing here should rewrite one by accident.
    const mp4 = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
    ])

    expect(Array.from(stripImageMetadata(mp4))).toEqual(Array.from(mp4))
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

describe('stripImageMetadata on a PNG (STOURIFY-45)', () => {
  it('removes the eXIf card that holds the coordinates', () => {
    expect(chunkNamesOf(pngWithGps())).toContain('eXIf')

    expect(chunkNamesOf(stripImageMetadata(pngWithGps()))).not.toContain('eXIf')
  })

  it('removes the text and timestamp cards, which can carry a location too', () => {
    const original = pngWith([
      textChunk('tEXt', 'Comment\0Taken at 14 Privet Drive'),
      textChunk('zTXt', 'Comment\0\0compressed'),
      textChunk('iTXt', 'XML:com.adobe.xmp\0\0\0\0\0<exif:GPSLatitude>14,35N</exif:GPSLatitude>'),
      pngChunk('tIME', [0x07, 0xea, 0x09, 0x0d, 0x0c, 0x00, 0x00]),
    ])

    const names = chunkNamesOf(stripImageMetadata(original))

    expect(names).not.toContain('tEXt')
    expect(names).not.toContain('zTXt')
    expect(names).not.toContain('iTXt')
    expect(names).not.toContain('tIME')
  })

  it('keeps the cards that decide how the picture LOOKS, in order', () => {
    const original = pngWith([
      pngChunk('sRGB', [0x00]),
      pngChunk('eXIf', tiffWithGps()),
      pngChunk('pHYs', [0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 0x01]),
    ])

    expect(chunkNamesOf(stripImageMetadata(original))).toEqual([
      'IHDR',
      'sRGB',
      'pHYs',
      'IDAT',
      'IEND',
    ])
  })

  it('leaves the pixel data byte-identical', () => {
    expect(chunkContentsOf(stripImageMetadata(pngWithGps()), 'IDAT')).toEqual(PNG_PIXELS)
  })

  it('drops bytes hidden after the end card', () => {
    const clean = pngWith([])
    const withTrailer = new Uint8Array([...clean, 0x50, 0x72, 0x69, 0x76, 0x65, 0x74])

    expect(Array.from(stripImageMetadata(withTrailer))).toEqual(Array.from(clean))
  })

  it('returns a PNG with nothing to remove unchanged, and is idempotent', () => {
    const clean = pngWith([])
    const once = stripImageMetadata(pngWithGps())

    expect(Array.from(stripImageMetadata(clean))).toEqual(Array.from(clean))
    expect(Array.from(stripImageMetadata(once))).toEqual(Array.from(once))
    expect(Array.from(once)).toEqual(Array.from(clean))
  })

  it('throws on a PNG whose card runs past the end of the file', () => {
    const malformed = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x7f, 0xff, 0xff, 0xff, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x00,
    ])

    expect(() => stripImageMetadata(malformed)).toThrow(MetadataStripError)
  })

  it('throws on a PNG that was cut short before its end card', () => {
    const full = pngWithGps()
    const cutShort = full.slice(0, full.length - 12)

    expect(() => stripImageMetadata(cutShort)).toThrow(MetadataStripError)
  })
})

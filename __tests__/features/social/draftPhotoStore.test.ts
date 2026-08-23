/**
 * A deterministic stand-in for the filesystem, in the same shape the media
 * tests use. Recording the writes and deletes is the point: "the bytes were
 * copied" and "the copy was cleaned up" are claims about files, and a test that
 * only reads the database cannot tell either of them from a storage leak.
 */
const fsCalls: { reads: string[]; writes: string[]; deletes: string[] } = {
  reads: [],
  writes: [],
  deletes: [],
}

/**
 * Paths the mock filesystem refuses to read, so a copy failure can be
 * exercised. Named with the `mock` prefix because jest only lets a module
 * factory reach variables spelled that way.
 */
const mockUnreadable = new Set<string>()

jest.mock('expo-file-system', () => {
  const present = new Set<string>()

  class MockFile {
    uri: string

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    get exists(): boolean {
      return present.has(this.uri)
    }

    async bytes() {
      if (mockUnreadable.has(this.uri)) throw new Error('gone')
      fsCalls.reads.push(this.uri)
      return new Uint8Array([1, 2, 3])
    }

    write(_bytes: Uint8Array) {
      fsCalls.writes.push(this.uri)
      present.add(this.uri)
    }

    delete() {
      if (!present.has(this.uri)) throw new Error('no such file')
      fsCalls.deletes.push(this.uri)
      present.delete(this.uri)
    }
  }

  class MockDirectory {
    uri: string

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    create() {}
  }

  return {
    __esModule: true,
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///document-dir' } },
  }
})

import {
  DRAFT_PHOTO_DIR_NAME,
  copyDraftPhotos,
  deleteDraftPhotos,
} from '@/features/social/api/draftPhotoStore'

const DIR = `file:///document-dir/${DRAFT_PHOTO_DIR_NAME}`

beforeEach(() => {
  fsCalls.reads = []
  fsCalls.writes = []
  fsCalls.deletes = []
  mockUnreadable.clear()
})

describe('copyDraftPhotos', () => {
  it('copies each photo out of the OS cache and points the draft at the copy', async () => {
    const copied = await copyDraftPhotos('draft-1', [
      { uri: 'file:///cache/pick/IMG_1.jpg', fileName: 'IMG_1.jpg', type: 'image/jpeg' },
      { uri: 'file:///cache/pick/IMG_2.jpg', fileName: 'IMG_2.jpg', type: 'image/jpeg' },
    ])

    expect(copied.map((photo) => photo.uri)).toEqual([
      `${DIR}/draft-1-0.jpg`,
      `${DIR}/draft-1-1.jpg`,
    ])
    expect(fsCalls.writes).toEqual([`${DIR}/draft-1-0.jpg`, `${DIR}/draft-1-1.jpg`])
    // The name and type the picker gave are the post's, and they travel with it.
    expect(copied[0].fileName).toBe('IMG_1.jpg')
    expect(copied[0].type).toBe('image/jpeg')
  })

  it('leaves a photo it has already copied alone', async () => {
    const once = await copyDraftPhotos('draft-1', [
      { uri: 'file:///cache/pick/IMG_1.jpg', fileName: 'IMG_1.jpg' },
    ])
    fsCalls.writes = []

    const twice = await copyDraftPhotos('draft-1', once)

    expect(twice).toEqual(once)
    expect(fsCalls.writes).toEqual([])
  })

  it('keeps the original address when the bytes cannot be read', async () => {
    mockUnreadable.add('file:///cache/pick/GONE.jpg')

    const copied = await copyDraftPhotos('draft-1', [
      { uri: 'file:///cache/pick/GONE.jpg', fileName: 'GONE.jpg' },
      { uri: 'file:///cache/pick/OK.jpg', fileName: 'OK.jpg' },
    ])

    // A photo that could not be copied is a worse photo, never a lost caption.
    expect(copied[0].uri).toBe('file:///cache/pick/GONE.jpg')
    expect(copied[1].uri).toBe(`${DIR}/draft-1-1.jpg`)
  })

  it('gives a photo with no filename a sensible extension rather than none', async () => {
    const copied = await copyDraftPhotos('draft-2', [{ uri: 'file:///cache/pick/anon' }])

    expect(copied[0].uri).toBe(`${DIR}/draft-2-0.jpg`)
  })
})

describe('deleteDraftPhotos', () => {
  it('deletes the copies it made, and only those', async () => {
    const copied = await copyDraftPhotos('draft-1', [
      { uri: 'file:///cache/pick/IMG_1.jpg', fileName: 'IMG_1.jpg' },
      { uri: 'file:///cache/pick/IMG_2.jpg', fileName: 'IMG_2.jpg' },
    ])

    await deleteDraftPhotos(copied)

    expect(fsCalls.deletes).toEqual([`${DIR}/draft-1-0.jpg`, `${DIR}/draft-1-1.jpg`])
  })

  it('does not touch a photo that is not one of ours', async () => {
    await deleteDraftPhotos([{ uri: 'file:///cache/pick/IMG_1.jpg', fileName: 'IMG_1.jpg' }])

    expect(fsCalls.deletes).toEqual([])
  })

  it('is happy when the file is already gone', async () => {
    const copied = await copyDraftPhotos('draft-1', [{ uri: 'file:///cache/pick/IMG_1.jpg' }])
    await deleteDraftPhotos(copied)

    await expect(deleteDraftPhotos(copied)).resolves.toBeUndefined()
  })
})

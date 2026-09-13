/**
 * The photo gallery's layout rule (STOURIFY-293, artboard 2 of the Spot Hub
 * design): rows of photos at their own shapes, like a printed album page.
 *
 * Picture laying prints along a shelf. Each print keeps its own proportions,
 * and you keep adding prints to the row until, scaled to one common height,
 * they fill the shelf edge to edge. That height is this row's height. Then you
 * start the next row. A wide landscape takes the room of two squares; a tall
 * portrait takes half of one.
 *
 * The mechanism: for a row of photos with aspect ratios a₁…aₙ, the height that
 * makes them fill `width` exactly is `(width − gaps) / Σa`. Adding a photo
 * lowers that height, so the row closes as soon as it drops to `targetHeight`
 * or below. The last row usually has too few photos to fill the width, so it
 * keeps `targetHeight` and stops short, rather than being blown up into one
 * enormous photo.
 *
 * Pure on purpose: the screen measures the photos, this does the arithmetic,
 * and the tests check the arithmetic without rendering a single image.
 */

/** One row of the grid: which photos sit on it, and how tall it is drawn. */
export interface JustifiedRow {
  /** Indexes into the list the aspect ratios came from, in order. */
  items: number[]
  height: number
}

interface Options {
  /** The height a row aims for; a full row is drawn at or just under it. */
  targetHeight: number
  /** Points between two photos on a row. */
  gap: number
}

/**
 * The narrowest and widest shape a tile may take.
 *
 * Without a limit a 10:1 panorama would be a strip a few points tall, and a
 * 1:10 screenshot a row of its own several screens high. Past these bounds the
 * tile crops, which is how every album app treats the extremes.
 */
const MIN_ASPECT = 0.5
const MAX_ASPECT = 2.5

/** A photo's usable aspect ratio: clamped, and 1 (square) when unknown. */
export function clampAspect(aspect: number | undefined): number {
  if (aspect === undefined || !Number.isFinite(aspect) || aspect <= 0) return 1
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect))
}

export function justifyRows(
  aspects: number[],
  width: number,
  { targetHeight, gap }: Options,
): JustifiedRow[] {
  const rows: JustifiedRow[] = []
  let items: number[] = []
  let sum = 0

  const fillHeight = () => (width - gap * (items.length - 1)) / sum

  aspects.forEach((aspect, index) => {
    items.push(index)
    sum += clampAspect(aspect)

    const height = fillHeight()
    if (height <= targetHeight) {
      rows.push({ items, height })
      items = []
      sum = 0
    }
  })

  if (items.length > 0) {
    rows.push({ items, height: Math.min(targetHeight, fillHeight()) })
  }

  return rows
}

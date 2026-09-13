import { justifyRows } from '@/features/spots/utils/justifyRows'

/**
 * The photo gallery's layout rule (STOURIFY-293): rows of photos at their own
 * shapes, each full row filling the width exactly, like a printed album page.
 *
 * Kept a pure function so the arithmetic is tested here, once, rather than by
 * measuring rendered tiles through a mocked image component.
 */
const GAP = 4
const WIDTH = 3 * 100 + 2 * GAP // three 100-point squares and two gaps

function widths(rows: ReturnType<typeof justifyRows>, aspects: number[]): number[][] {
  return rows.map((row) => row.items.map((index) => aspects[index] * row.height))
}

it('puts three squares on a row at the height that fills the width', () => {
  const rows = justifyRows([1, 1, 1, 1, 1, 1], WIDTH, { targetHeight: 120, gap: GAP })

  expect(rows.map((row) => row.items)).toEqual([
    [0, 1, 2],
    [3, 4, 5],
  ])
  expect(rows[0].height).toBeCloseTo(100)
})

it('gives a wide photo twice the room of a square on the same row', () => {
  const aspects = [2, 1, 1]
  const rows = justifyRows(aspects, WIDTH, { targetHeight: 120, gap: GAP })

  expect(rows[0].items).toEqual([0, 1])
  const [wide, square] = widths(rows, aspects)[0]
  expect(wide).toBeCloseTo(square * 2)
})

it('fills every full row edge to edge', () => {
  const aspects = [1.5, 0.75, 1, 1.33, 0.8, 2, 1, 1.2, 0.66]
  const rows = justifyRows(aspects, WIDTH, { targetHeight: 120, gap: GAP })

  // Every row but the last is stretched to the width exactly.
  for (const [index, row] of rows.slice(0, -1).entries()) {
    const used = widths(rows, aspects)[index].reduce((sum, w) => sum + w, 0)
    expect(used + GAP * (row.items.length - 1)).toBeCloseTo(WIDTH)
  }
})

it('does not blow a short last row up to fill the width', () => {
  const rows = justifyRows([1, 1, 1, 1], WIDTH, { targetHeight: 120, gap: GAP })

  // One square left over would be 308 points tall if stretched like the rest.
  expect(rows[1].items).toEqual([3])
  expect(rows[1].height).toBe(120)
})

it('keeps every photo exactly once, in order', () => {
  const aspects = [1, 2, 0.5, 1, 1, 3, 1]
  const rows = justifyRows(aspects, WIDTH, { targetHeight: 120, gap: GAP })

  expect(rows.flatMap((row) => row.items)).toEqual([0, 1, 2, 3, 4, 5, 6])
})

it('tames a panorama and a sliver so neither takes over a row', () => {
  // A 10:1 panorama would otherwise be a strip a few points tall, and a 1:10
  // sliver a row of its own several screens high.
  const rows = justifyRows([10, 0.1], WIDTH, { targetHeight: 120, gap: GAP })

  for (const row of rows) {
    expect(row.height).toBeGreaterThan(40)
    expect(row.height).toBeLessThanOrEqual(120)
  }
})

it('answers an empty list with no rows', () => {
  expect(justifyRows([], WIDTH, { targetHeight: 120, gap: GAP })).toEqual([])
})

import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useRecentSearches } from '@/features/search/recentSearches'

beforeEach(async () => {
  await AsyncStorage.clear()
})

/**
 * `renderHook` plus a flush of the hook's own disk read.
 *
 * The initial load is genuinely async — it is what lets a query survive an app
 * restart — so its `setState` lands on a later microtask than the mount does.
 * Every test below acts on the hook synchronously afterwards, and letting that
 * load land mid-test would otherwise fire outside any `act()`, which React
 * warns about even though `hasWrittenRef` makes it a no-op once a write has
 * happened.
 */
async function renderRecentSearches() {
  const rendered = renderHook(() => useRecentSearches())
  await act(async () => {
    await Promise.resolve()
  })
  return rendered
}

it('starts empty and records a query, newest first', async () => {
  const { result } = await renderRecentSearches()

  act(() => result.current.record('sunset viewpoints'))
  act(() => result.current.record('best coffee'))

  expect(result.current.queries).toEqual(['best coffee', 'sunset viewpoints'])
})

it('de-duplicates case-insensitively, moving the repeat to the front', async () => {
  const { result } = await renderRecentSearches()

  act(() => result.current.record('Sunset Viewpoints'))
  act(() => result.current.record('best coffee'))
  act(() => result.current.record('sunset viewpoints'))

  expect(result.current.queries).toEqual(['sunset viewpoints', 'best coffee'])
})

it('caps the list at 8, dropping the oldest', async () => {
  const { result } = await renderRecentSearches()

  for (let i = 0; i < 9; i += 1) {
    act(() => result.current.record(`query ${i}`))
  }

  expect(result.current.queries).toHaveLength(8)
  expect(result.current.queries[0]).toBe('query 8')
  expect(result.current.queries).not.toContain('query 0')
})

it('removes one query, leaving the rest untouched', async () => {
  const { result } = await renderRecentSearches()

  act(() => result.current.record('sunset viewpoints'))
  act(() => result.current.record('best coffee'))
  act(() => result.current.remove('sunset viewpoints'))

  expect(result.current.queries).toEqual(['best coffee'])
})

it('clears every query', async () => {
  const { result } = await renderRecentSearches()

  act(() => result.current.record('sunset viewpoints'))
  act(() => result.current.clear())

  expect(result.current.queries).toEqual([])
})

it('persists across a remount, once the disk read has resolved', async () => {
  const first = await renderRecentSearches()
  act(() => first.result.current.record('sunset viewpoints'))
  first.unmount()

  const second = renderHook(() => useRecentSearches())
  await waitFor(() => expect(second.result.current.queries).toEqual(['sunset viewpoints']))
})

it('ignores a blank query', async () => {
  const { result } = await renderRecentSearches()

  act(() => result.current.record('   '))

  expect(result.current.queries).toEqual([])
})

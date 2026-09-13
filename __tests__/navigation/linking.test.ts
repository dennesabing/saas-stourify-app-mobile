import { getStateFromPath } from '@react-navigation/native'
import linking from '@/shared/navigation/linking'

/**
 * These tests read the deep-link table the app actually ships
 * (`shared/navigation/linking.ts`) and ask React Navigation itself what each
 * URL turns into. Nothing is mocked, so what passes here is the same
 * translation the real app performs when Android hands it a `stourify://` link
 * (STOURIFY-253).
 *
 * `getStateFromPath` wants the part after the scheme, which is what React
 * Navigation strips the prefix down to before matching.
 */

const config = linking.config!

/** Walks to the innermost route in the state tree — the screen a link lands on. */
function leafRoute(path: string) {
  let route = getStateFromPath(path, config)?.routes?.[0]

  while (route?.state?.routes) {
    const next = route.state.routes[route.state.routes.length - 1]
    if (!next) break
    route = next
  }

  return route
}

describe('deep link table', () => {
  it('declares the app scheme as a prefix', () => {
    expect(linking.prefixes).toContain('stourify://')
  })

  it('opens a spot on SpotDetail', () => {
    const route = leafRoute('spot/abc-123')

    expect(route?.name).toBe('SpotDetail')
    expect(route?.params).toEqual({ spotId: 'abc-123' })
  })

  it('opens the About tab when the link asks for it', () => {
    const route = leafRoute('spot/abc-123?tab=about')

    expect(route?.name).toBe('SpotDetail')
    expect(route?.params).toEqual({ spotId: 'abc-123', tab: 'About' })
  })

  // The page has three tabs since STOURIFY-292, and each has a link of its own.
  it('opens the Photos tab when the link asks for it', () => {
    const route = leafRoute('spot/abc-123?tab=photos')

    expect(route?.params).toEqual({ spotId: 'abc-123', tab: 'Photos' })
  })

  it('opens the Reviews tab when the link asks for it', () => {
    const route = leafRoute('spot/abc-123?tab=reviews')

    expect(route?.params).toEqual({ spotId: 'abc-123', tab: 'Reviews' })
  })

  // "Posts" was the tab's name until STOURIFY-292. A link written then still
  // means the same shelf of photos, so it must not quietly land somewhere else.
  it('still opens the photos for a link written when the tab was called Posts', () => {
    const route = leafRoute('spot/abc-123?tab=posts')

    expect(route?.params).toEqual({ spotId: 'abc-123', tab: 'Photos' })
  })

  it('treats any other tab value as About, the tab the page opens on', () => {
    const route = leafRoute('spot/abc-123?tab=nonsense')

    expect(route?.params).toEqual({ spotId: 'abc-123', tab: 'About' })
  })

  it('opens the photo gallery', () => {
    const route = leafRoute('spot/abc-123/photos')

    expect(route?.name).toBe('PhotoGallery')
    expect(route?.params).toEqual({ spotId: 'abc-123' })
  })

  it('opens the reviews list', () => {
    const route = leafRoute('spot/abc-123/reviews')

    expect(route?.name).toBe('Reviews')
    expect(route?.params).toEqual({ spotId: 'abc-123' })
  })

  it('lands inside the Discover tab, so Back has somewhere to go', () => {
    const state = getStateFromPath('spot/abc-123', config)
    const tabs = state?.routes?.[0]

    expect(tabs?.name).toBe('MainTabs')
    expect(tabs?.state?.routes?.[0]?.name).toBe('DiscoverTab')
    expect(tabs?.state?.routes?.[0]?.state?.routes?.[0]?.name).toBe('Discover')
  })

  it('matches nothing for a path the table does not declare', () => {
    expect(getStateFromPath('spot', config)).toBeUndefined()
    expect(getStateFromPath('post/abc-123', config)).toBeUndefined()
  })
})

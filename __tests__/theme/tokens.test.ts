import { minTouchTarget, palette, radius, typography } from '@/theme/tokens'

/**
 * Guards the transcription against the locked handoff at
 * `docs/Project - Stourify/_ds/stourify-design-system-<id>/styles.css`.
 *
 * These are not tautologies: the tokens are hand-transcribed from CSS, and a
 * silent typo in a hex value is exactly the kind of drift nobody notices until
 * a screen looks subtly wrong in review.
 */
describe('Wander D4 tokens', () => {
  it('matches the locked brand colours', () => {
    expect(palette.light.primary).toBe('#1C6FB0')
    expect(palette.light.button).toBe('#2E4A63')
    expect(palette.light.accent).toBe('#EB7A50')
    expect(palette.light.accent2).toBe('#3FA7C4')
    expect(palette.light.surface).toBe('#F3F7FB')
  })

  it('defines every light role in the dark palette too', () => {
    // Dark mode is a first-class target, not an afterthought screens opt into.
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort())
  })

  it('keeps the primary button distinct from the brand colour', () => {
    // A recurring mistake: filling the primary button with brand azure. The
    // handoff reserves azure for links, active tabs and Follow.
    expect(palette.light.button).not.toBe(palette.light.primary)
    expect(palette.dark.button).not.toBe(palette.dark.primary)
  })

  it('matches the locked radii', () => {
    expect(radius.card).toBe(18)
    expect(radius.button).toBe(12)
    expect(radius.chip).toBe(999)
  })

  it('splits the type scale between the display and body families', () => {
    expect(typography.display.fontFamily).toContain('Fraunces')
    expect(typography.h1.fontFamily).toContain('Fraunces')
    expect(typography.body.fontFamily).toContain('Inter')
    expect(typography.caption.fontFamily).toContain('Inter')
  })

  it('renders chips and badges uppercase', () => {
    expect(typography.micro.textTransform).toBe('uppercase')
  })

  it('holds the accessible minimum touch target', () => {
    expect(minTouchTarget).toBe(44)
  })
})

import { Check, ChevronLeft, ChevronRight, MapPin, Plus, RefreshCw } from 'lucide-react-native'
import { useTheme } from '@/theme/ThemeProvider'
import type { ColorRole } from '@/theme/tokens'

/**
 * The icons the app draws, by what they MEAN rather than what they look like.
 *
 * Lucide (ISC licence) is the set the design artboards are drawn with — the
 * map pin in `docs/design/Stourify - Create.dc.html` is Lucide's own path — so
 * it was adopted as the app's icon set in STOURIFY-257, replacing the glyph
 * characters screens used to fake icons with.
 *
 * This table is the only file that names the set. A screen asks for `pin`, not
 * `MapPin`, so swapping the set later is a change to this table and nothing
 * else. Add a meaning here when a screen needs one; do not import from
 * `lucide-react-native` anywhere else.
 */
const GLYPHS = {
  add: Plus,
  back: ChevronLeft,
  check: Check,
  forward: ChevronRight,
  pin: MapPin,
  sync: RefreshCw,
} as const

export type IconName = keyof typeof GLYPHS

interface Props {
  name: IconName
  /** Points. The design draws most icons at 18–24. */
  size?: number
  color?: ColorRole
  /** The design's stroke is 2 almost everywhere; a tick is drawn heavier. */
  strokeWidth?: number
  testID?: string
}

/**
 * A decorative icon. It is hidden from screen readers on purpose: the control
 * around it carries the label, so a reader says "Back", not "chevron left Back".
 */
export default function Icon({ name, size = 20, color = 'ink', strokeWidth = 2, testID }: Props) {
  const theme = useTheme()
  const Glyph = GLYPHS[name]

  return (
    <Glyph
      testID={testID}
      size={size}
      color={theme.colors[color]}
      strokeWidth={strokeWidth}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  )
}

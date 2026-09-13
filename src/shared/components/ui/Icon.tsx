import {
  ArrowUpDown,
  Ban,
  Bell,
  Bookmark,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudUpload,
  Compass,
  Contrast,
  Ellipsis,
  EyeOff,
  FileText,
  Heart,
  Info,
  KeyRound,
  LayoutGrid,
  Link,
  List,
  LocateFixed,
  Lock,
  LogOut,
  Mail,
  Map,
  MapPin,
  MessageCircle,
  Navigation,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  Star,
  ThumbsUp,
  Ticket,
  Trash2,
  TriangleAlert,
  User,
  X,
} from 'lucide-react-native'
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
  /** Your activity — the Home header's bell (STOURIFY-260). */
  bell: Bell,
  /** Taking photos — onboarding's Camera permission row (STOURIFY-287). */
  camera: Camera,
  check: Check,
  /** A post's comments. */
  comment: MessageCircle,
  /** A like. Pass `fill` to draw it solid once liked. */
  heart: Heart,
  /** A per-item overflow menu — Report, today. */
  more: Ellipsis,
  /** Send what you typed — the comment composer's button. */
  send: Send,
  /** A recent search (STOURIFY-259). */
  clock: Clock,
  /** Dismiss or clear — a recent search, a search field. */
  close: X,
  forward: ChevronRight,
  /** Switch to a list view of the same spots. */
  list: List,
  /** Bring the map back to where you are. */
  locate: LocateFixed,
  /** Switch to, or open, a map. */
  map: Map,
  /** Go to a spot — the round button on a map peek card. */
  navigate: Navigation,
  pin: MapPin,
  search: Search,
  /** Change how a list is ordered or bounded — Nearby's radius chip. */
  sort: ArrowUpDown,
  sync: RefreshCw,
  /** Changes on their way to the server — the Sync status banner (STOURIFY-294). */
  upload: CloudUpload,
  /** Something the server refused — the Sync status banner's retry state (STOURIFY-294). */
  warning: TriangleAlert,
  /** You — Settings → Edit profile (STOURIFY-290). */
  account: User,
  /** Light or dark — Settings → Appearance. The design's half-filled circle. */
  appearance: Contrast,
  /** Somebody you have blocked. */
  block: Ban,
  /** A published document — Terms & privacy policy. */
  document: FileText,
  /** Something to read about the app itself — About Stourify (STOURIFY-291). */
  info: Info,
  /** Privacy & security. */
  lock: Lock,
  /** Leave the account on this phone — Log out. */
  logout: LogOut,
  /** An account only approved followers can see. */
  private: EyeOff,
  /** Delete for good — Delete account. */
  trash: Trash2,
  /** The brand mark on Splash — the canvas draws Lucide's compass (STOURIFY-286). */
  compass: Compass,
  /** An email address — the sign-in forms' Email field, Forgot password's tile. */
  mail: Mail,
  /** A one-time code — the reset code on Choose a new password. */
  key: KeyRound,
  /** An invitation — sign-up's Invitation code field. */
  ticket: Ticket,
  /** The profile header's menu of your own settings (STOURIFY-288). */
  settings: Settings,
  /** A web address — the website under a profile's bio. */
  link: Link,
  /** Hand something to another app — the spot page's Share (STOURIFY-301). */
  share: Share2,
  /** A grid of photos — the profile's Spots tab. */
  grid: LayoutGrid,
  /** Your saved spots — the profile's Wishlist tab. */
  bookmark: Bookmark,
  /** Change something you wrote — the profile's Edit profile button. */
  edit: Pencil,
  /** One star of a rating you give — Write a review's star picker (STOURIFY-293). */
  star: Star,
  /** A review you found useful — the reviews list's "Helpful · N" (STOURIFY-293). */
  thumbsUp: ThumbsUp,
} as const

export type IconName = keyof typeof GLYPHS

interface Props {
  name: IconName
  /** Points. The design draws most icons at 18–24. */
  size?: number
  color?: ColorRole
  /** The design's stroke is 2 almost everywhere; a tick is drawn heavier. */
  strokeWidth?: number
  /**
   * Fill the outline with a colour — a liked heart. Omitted, the glyph is the
   * design's plain outline, which is Lucide's own default.
   */
  fill?: ColorRole
  testID?: string
}

/**
 * A decorative icon. It is hidden from screen readers on purpose: the control
 * around it carries the label, so a reader says "Back", not "chevron left Back".
 */
export default function Icon({
  name,
  size = 20,
  color = 'ink',
  strokeWidth = 2,
  fill,
  testID,
}: Props) {
  const theme = useTheme()
  const Glyph = GLYPHS[name]

  return (
    <Glyph
      testID={testID}
      size={size}
      color={theme.colors[color]}
      fill={fill ? theme.colors[fill] : 'none'}
      strokeWidth={strokeWidth}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  )
}

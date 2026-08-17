import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  children: ReactNode
  /**
   * Centre the content vertically when it is shorter than the screen — the look
   * every auth screen has. Off by default, which is what a long form wants.
   */
  centered?: boolean
  /** Safe-area edges to reserve. Defaults to the whole inset. */
  edges?: readonly Edge[]
  /** Merged over the defaults, so a screen keeps its own padding and gaps. */
  contentContainerStyle?: StyleProp<ViewStyle>
  backgroundColor?: string
  testID?: string
}

/**
 * A screen wrapper that keeps the focused field above the on-screen keyboard.
 *
 * Picture the screen as a sheet of paper in a tray. Android used to shrink the
 * tray when the keyboard slid up, so the paper got shorter and everything still
 * fit — that is what `android:windowSoftInputMode="adjustResize"` in the
 * manifest asks for. Under **edge-to-edge** (`edgeToEdgeEnabled=true`, which
 * Expo SDK 54 requires) the tray no longer shrinks: the app draws all the way to
 * the physical edges, keyboard included, and is handed the keyboard's height as
 * an inset to deal with itself. `adjustResize` is still in the manifest and is
 * now inert.
 *
 * `KeyboardAvoidingView` is what deals with it. It measures how much of itself
 * the keyboard covers and pads that much space at the bottom, so the content
 * above stays visible. It works here because its Android path listens for
 * `keyboardDidShow`/`keyboardDidHide` and measures its own frame — it never
 * relied on the window resizing.
 *
 * `keyboardShouldPersistTaps="handled"` is the other half, and it is not
 * cosmetic: without it the first tap on a button below the fields is spent
 * dismissing the keyboard and the user has to tap twice.
 *
 * STOURIFY-100.
 */
export default function KeyboardAwareScreen({
  children,
  centered = false,
  edges,
  contentContainerStyle,
  backgroundColor,
  testID,
}: Props) {
  const theme = useTheme()

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: backgroundColor ?? theme.colors.surface }}
      edges={edges}
      testID={testID}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={[
            { padding: theme.gutter },
            // `flexGrow: 1` is what lets short content sit centred on a tall
            // screen and still scroll once the keyboard has taken half of it.
            centered ? { flexGrow: 1, justifyContent: 'center' } : null,
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

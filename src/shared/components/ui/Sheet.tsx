import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

interface Props {
  visible: boolean
  /** Called by the backdrop tap and by the Android back gesture. */
  onClose: () => void
  title?: string
  /** Explanatory line under the title, for a sheet that asks rather than lists. */
  subtitle?: string
  children: ReactNode
}

/**
 * A bottom sheet — the kit's modal surface.
 *
 * The design system had no sheet, dialog or menu component until STOURIFY-37,
 * and three interactions on that card needed one: an overflow menu, a
 * destructive confirmation, and a form. The alternative was `Alert.alert`, which
 * is one line of code and cannot host a form at all — `SettingsScreen`'s
 * delete-account flow had already hit that wall and built its own sheet by hand,
 * in colour literals. This is that shape, on tokens, so the next one does not
 * have to be built again.
 *
 * Built on React Native's `Modal` rather than a gesture-driven library. A
 * draggable sheet is a native module, and adding one would force a rebuild of
 * the dev client and of the APK — the same reasoning that keeps legal links on
 * `Linking` instead of an in-app browser. Nothing here needs a drag: every sheet
 * on this card is dismissed by a button or by the backdrop.
 *
 * The backdrop is a tap-target on purpose. On Android the back gesture also
 * closes it (`onRequestClose`), so there are two ways out of every sheet and
 * neither of them is hunting for a small ✕.
 */
export default function Sheet({ visible, onClose, title, subtitle, children }: Props) {
  const theme = useTheme()

  // **The bottom inset is load-bearing, and the live run is what found it.**
  // Without it the sheet's last control sat in the same strip of screen as the
  // tab bar and the gesture bar: on the emulator, a tap aimed at the sheet's
  // bottom button landed on the Create tab instead and navigated away. A modal
  // draws over the tab bar, so the collision is invisible until somebody aims
  // at that strip — which is exactly where a sheet puts its primary action.
  const insets = useSafeAreaInsets()
  const bottomGap = Math.max(insets.bottom, theme.spacing[4]) + theme.spacing[6]

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Keyboard-aware because a sheet can host a form — `ReportSheet` does.
          Under edge-to-edge (`edgeToEdgeEnabled=true`, required by Expo SDK 54)
          Android stops resizing the window when the keyboard opens, and a modal
          has its own window besides, so a sheet docked to the bottom edge is
          covered outright unless it lifts itself. STOURIFY-100. */}
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior="padding">
        {/* Scrim. `accessibilityLabel` names the gesture rather than the
            decoration, because to a screen reader this IS the dismiss control. */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={{ flex: 1, backgroundColor: theme.colors.scrim }}
        />

        <View
          style={{
            backgroundColor: theme.colors.card,
            borderTopLeftRadius: theme.radius.sheet,
            borderTopRightRadius: theme.radius.sheet,
            paddingHorizontal: theme.gutter,
            paddingTop: theme.spacing[4],
            paddingBottom: bottomGap,
            gap: theme.spacing[3],
          }}
        >
          {title ? <Text variant="h2">{title}</Text> : null}

          {subtitle ? (
            <Text variant="body" color="muted">
              {subtitle}
            </Text>
          ) : null}

          {/* Scrollable so a long reason list or a sheet lifted by the keyboard
              stays reachable; `nestedScrollEnabled` because a sheet opened over
              a FlatList is a scroll view inside a scroll view on Android.
              `keyboardShouldPersistTaps` so the sheet's primary action works on
              the first tap while a field is focused, rather than the first tap
              being spent dismissing the keyboard. */}
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: theme.spacing[3] }}
            style={{ maxHeight: 480 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

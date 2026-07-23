import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Text from '@/shared/components/ui/Text'
import { useTheme } from '@/theme/ThemeProvider'

const GLYPHS: Record<string, string> = {
  HomeTab: '⌂',
  DiscoverTab: '◎',
  CreateTab: '+',
  ActivityTab: '♡',
  ProfileTab: '☺',
}

const LABELS: Record<string, string> = {
  HomeTab: 'Home',
  DiscoverTab: 'Discover',
  CreateTab: 'Create',
  ActivityTab: 'Activity',
  ProfileTab: 'Profile',
}

/**
 * The deck's tab bar: four labelled tabs with a raised coral Create action in
 * the centre. Coral is the accent reserved for the centre action and FABs —
 * azure marks the active tab.
 *
 * Custom rather than configured because the centre item is a floating circle
 * that breaks the bar's bounds, which the default bar cannot express.
 */
export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.hairline,
          paddingBottom: Math.max(insets.bottom, theme.spacing[2]),
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index
        const isCreate = route.name === 'CreateTab'

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name)
          }
        }

        if (isCreate) {
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel="Create"
              style={styles.item}
            >
              <View
                style={[
                  styles.createButton,
                  { backgroundColor: theme.colors.accent, ...theme.elevation.floating },
                ]}
              >
                <Text variant="h1" color="onButton" style={styles.createGlyph}>
                  {GLYPHS.CreateTab}
                </Text>
              </View>
            </Pressable>
          )
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={LABELS[route.name] ?? route.name}
            style={styles.item}
          >
            <Text variant="h2" color={isFocused ? 'primary' : 'muted'} style={styles.glyph}>
              {GLYPHS[route.name] ?? '•'}
            </Text>
            <Text variant="micro" color={isFocused ? 'primary' : 'muted'}>
              {LABELS[route.name] ?? route.name}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: 1, paddingTop: 8 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 44, gap: 2 },
  glyph: { lineHeight: 24 },
  createButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  createGlyph: { lineHeight: 32 },
})

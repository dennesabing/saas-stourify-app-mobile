import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

interface Props {
  /** Falls back to initials when absent — never a broken image box. */
  uri?: string | null
  name?: string | null
  size?: number
  /** Azure ring — marks the author on a post header and Pro explorers. */
  ringed?: boolean
}

function initialsFrom(name?: string | null): string {
  if (!name) return '?'

  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')

  return letters.toUpperCase() || '?'
}

export default function Avatar({ uri, name, size = 40, ringed = false }: Props) {
  const theme = useTheme()

  const frame = {
    width: size,
    height: size,
    borderRadius: theme.radius.avatar,
    borderWidth: ringed ? 2 : 0,
    borderColor: theme.colors.primary,
  }

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={frame}
        contentFit="cover"
        transition={theme.motion.fast}
        accessibilityLabel={name ? `${name}'s avatar` : 'Avatar'}
      />
    )
  }

  return (
    <View
      accessibilityLabel={name ? `${name}'s avatar` : 'Avatar'}
      style={[styles.fallback, frame, { backgroundColor: theme.colors.badgeBg }]}
    >
      <Text variant="caption" color="badgeInk">
        {initialsFrom(name)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
})

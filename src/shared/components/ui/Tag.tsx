import { StyleSheet, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

interface Props {
  label: string
}

/**
 * Static category label — "Nature", "Viewpoint", "Foodie" — as it appears on
 * spot cards and the Spot Hub header. Always uppercase micro type on the
 * translucent brand fill.
 */
export default function Tag({ label }: Props) {
  const theme = useTheme()

  return (
    <View
      style={[
        styles.base,
        {
          borderRadius: theme.radius.tag,
          backgroundColor: theme.colors.badgeBg,
          paddingHorizontal: theme.spacing[2],
          paddingVertical: theme.spacing[1],
        },
      ]}
    >
      <Text variant="micro" color="badgeInk">
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: { alignSelf: 'flex-start' },
})

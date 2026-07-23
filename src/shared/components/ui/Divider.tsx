import { View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'

/** A 1px hairline. StyleSheet.hairlineWidth keeps it crisp on every density. */
export default function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme()

  return (
    <View
      style={{
        height: 1,
        marginLeft: inset,
        backgroundColor: theme.colors.hairline,
      }}
    />
  )
}

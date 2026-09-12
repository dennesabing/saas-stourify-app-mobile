import { Children, Fragment, type ReactNode } from 'react'
import { Pressable, View, type ViewStyle } from 'react-native'
import { Icon, Text } from '@/shared/components/ui'
import type { IconName } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

/** The design's `.row .ic`: a 32-point tile with 9-point corners. */
const TILE = 32

interface GroupProps {
  /** The small uppercase heading above the card — the design's `.grp-h`. Omit for a lone row. */
  label?: string
  children: ReactNode
}

/**
 * One group of Settings rows: a small uppercase heading, then the rows on one
 * card with a hairline between each pair. This is the design's `.grp-h` plus
 * `.card-grp` from `docs/design/Stourify - Settings.dc.html` (STOURIFY-290),
 * shared by the Settings hub and Privacy & security so the two cannot drift.
 */
export function SettingsGroup({ label, children }: GroupProps) {
  const theme = useTheme()
  const rows = Children.toArray(children)

  return (
    <View>
      {label ? (
        <Text
          variant="micro"
          color="muted"
          style={{
            fontFamily: theme.fontFamily.bodyBold,
            fontSize: 12,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: theme.spacing[2],
          }}
        >
          {label}
        </Text>
      ) : null}

      <View
        style={{
          marginHorizontal: theme.gutter,
          marginBottom: theme.spacing[1],
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.hairline,
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              <View style={{ height: 1, backgroundColor: theme.colors.hairline }} />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  )
}

interface RowProps {
  icon: IconName
  label: string
  /** The current setting, drawn quietly at the far end — "System", or a count. */
  value?: string
  onPress?: () => void
  /** A control drawn at the far end — a `Switch`. A row with one is not itself a button. */
  right?: ReactNode
  /** Draws the chevron that says "this opens something". Defaults to on for a pressable row. */
  chevron?: boolean
  /** Red label and red tile — Log out, Delete account. Changes no behaviour. */
  danger?: boolean
  testID?: string
}

/**
 * One Settings row — the design's `.row`: a tinted icon tile, the label, then a
 * value, a switch or a chevron.
 *
 * A pressable row names itself with its value too ("Appearance, System"), so a
 * screen reader hears the current setting without having to open it.
 */
export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  right,
  chevron = onPress != null,
  danger = false,
  testID,
}: RowProps) {
  const theme = useTheme()

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: theme.minTouchTarget,
    paddingVertical: 14,
    paddingHorizontal: 15,
  }

  const content = (
    <>
      <View
        style={{
          width: TILE,
          height: TILE,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: danger ? theme.colors.dangerBg : theme.colors.badgeBg,
        }}
      >
        <Icon name={icon} size={17} color={danger ? 'danger' : 'primary'} />
      </View>

      <Text
        variant="body"
        color={danger ? 'danger' : 'ink'}
        style={{ flex: 1, fontFamily: theme.fontFamily.bodyMedium }}
      >
        {label}
      </Text>

      {value ? (
        <Text variant="caption" color="muted">
          {value}
        </Text>
      ) : null}

      {right}

      {chevron ? <Icon name="forward" size={18} color="muted" /> : null}
    </>
  )

  if (!onPress) {
    return (
      <View testID={testID} style={rowStyle}>
        {content}
      </View>
    )
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.85 : 1 }]}
    >
      {content}
    </Pressable>
  )
}

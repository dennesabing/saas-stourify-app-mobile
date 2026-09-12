import { useMemo, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { OnboardingStackParamList } from '@/shared/navigation/types'
import { useCities, type CityRow } from '@/features/onboarding/hooks/useCities'
import { Button, EmptyState, Icon, SearchField, Text } from '@/shared/components/ui'
import OnboardingFrame from '@/features/onboarding/components/OnboardingFrame'
import { persistProfileChoice } from '@/features/onboarding/persistProfileChoice'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<OnboardingStackParamList, 'HomeCity'>

/** Featured cities first — the ones the team chose to lead with — then the rest by name. */
function byFeaturedThenName(a: CityRow, b: CityRow): number {
  if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1
  return a.name.localeCompare(b.name)
}

function matches(city: CityRow, needle: string): boolean {
  return [city.name, city.region, city.country].some(
    (part) => part !== null && part.toLowerCase().includes(needle),
  )
}

/** "Soccsksargen · Philippines", skipping whichever half the city does not have. */
function placeLine(city: CityRow): string {
  return [city.region, city.country].filter(Boolean).join(' · ')
}

/**
 * Artboard 3 of the Onboarding design (STOURIFY-287): a search field, then a
 * "Suggested" list with featured cities first.
 *
 * Reads `sto_cities` from the local database only — cities are pull-only
 * reference data already synced by M2, so this screen is offline by
 * construction, and the search is a filter over that same local copy: typing
 * asks nobody. An empty local table means the first delta has not landed yet (a
 * fresh account), never "there are no cities" — so it shows a still-syncing
 * state, not a bare empty list.
 *
 * The design also draws "Use my current location" and a map. Neither is built:
 * a city carries no coordinates the phone's position could be matched against,
 * and there is no reverse-geocoding service to ask.
 *
 * Saving the choice is the one part that is not local-only, and it used to be:
 * it wrote to the local profile row `if (profiles.length > 0)`, a guard that is
 * never true on a brand-new account, so the city went nowhere (STOURIFY-82).
 * `persistProfileChoice` handles both cases.
 */
export default function HomeCityScreen({ navigation }: Props) {
  const theme = useTheme()
  const database = useDatabase()
  const cities = useCities()
  const [query, setQuery] = useState('')
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const sorted = [...cities].sort(byFeaturedThenName)
    return needle === '' ? sorted : sorted.filter((city) => matches(city, needle))
  }, [cities, query])

  const skip = () => navigation.navigate('FollowSuggestions')

  async function persistAndAdvance(): Promise<void> {
    const city = cities.find((c) => c.id === selectedCityId)

    if (city && city.serverId !== null) {
      await persistProfileChoice(database, {
        kind: 'homeCity',
        cityServerId: city.serverId,
        cityUuid: city.uuid,
      })
    }

    navigation.navigate('FollowSuggestions')
  }

  const footer = (
    <Button
      label="Continue"
      size="lg"
      onPress={persistAndAdvance}
      disabled={!selectedCityId}
      fullWidth
    />
  )

  const frame = {
    step: 3,
    onSkip: skip,
    title: 'Set your home city',
    subtitle: 'Anchor discovery to where you explore most.',
    footer,
  }

  if (cities.length === 0) {
    return (
      <OnboardingFrame {...frame}>
        <EmptyState
          icon="🧭"
          title="Still syncing your cities"
          subtitle="This only takes a moment on your first launch."
        />
      </OnboardingFrame>
    )
  }

  return (
    <OnboardingFrame {...frame}>
      <SearchField placeholder="Search a city or region" value={query} onChangeText={setQuery} />

      <Text
        variant="caption"
        color="muted"
        style={{
          marginTop: theme.spacing[4],
          marginBottom: theme.spacing[2],
          fontFamily: theme.fontFamily.bodySemiBold,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        }}
      >
        {query.trim() === '' ? 'Suggested' : 'Matches'}
      </Text>

      <FlatList
        data={shown}
        keyExtractor={(city) => city.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: theme.spacing[2], paddingBottom: theme.spacing[2] }}
        ListEmptyComponent={
          <Text variant="body" color="muted">
            No city matches “{query.trim()}”.
          </Text>
        }
        renderItem={({ item }) => (
          <CityOption
            city={item}
            selected={selectedCityId === item.id}
            onPress={() => setSelectedCityId(item.id)}
          />
        )}
      />
    </OnboardingFrame>
  )
}

function CityOption({
  city,
  selected,
  onPress,
}: {
  city: CityRow
  selected: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const place = placeLine(city)

  return (
    <Pressable
      testID={`city-row-${city.uuid}`}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing[3],
        minHeight: theme.minTouchTarget,
        paddingVertical: theme.spacing[3],
        paddingHorizontal: 14,
        borderRadius: theme.radius.button,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? theme.colors.primary : theme.colors.hairline,
        backgroundColor: theme.colors.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name="pin" size={18} color={selected ? 'primary' : 'muted'} />
      <View style={{ flex: 1 }}>
        <Text variant="body" style={{ fontFamily: theme.fontFamily.bodySemiBold }}>
          {city.name}
        </Text>
        {place !== '' ? (
          <Text variant="caption" color="muted">
            {place}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <View
          testID="city-row-tick"
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.primary,
          }}
        >
          <Icon name="check" size={13} color="onButton" strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  )
}

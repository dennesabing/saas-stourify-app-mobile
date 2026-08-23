import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, SectionList, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { DiscoverStackParamList } from '@/shared/navigation/types'
import { searchDiscover, searchDiscoverType } from '@/shared/api/discover'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { Avatar, Chip, EmptyState, Input, Text } from '@/shared/components/ui'
import type {
  City,
  DiscoverSearchResults,
  DiscoverSearchType,
  PaginatedResponse,
  Person,
  Spot,
} from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<DiscoverStackParamList, 'Search'>

/**
 * `SearchRequest` makes `q` `required|min:2` — a shorter query is a 422, not an
 * empty result set — so nothing is sent below this length.
 */
const MIN_QUERY_LENGTH = 2

type Filter = 'all' | DiscoverSearchType

/**
 * The filter rail. These were six hardcoded category names (`Nature`, `Food`,
 * `History`, …) that no server rule had ever accepted, so pressing one did
 * nothing at all. They are now the endpoint's real `type` selector: `All` is
 * the grouped preview, the rest are one paginated section each (STOURIFY-9).
 */
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'spots', label: 'Spots' },
  { key: 'cities', label: 'Cities' },
  { key: 'people', label: 'People' },
]

/**
 * A result row, discriminated by its type. The endpoint returns three unrelated
 * shapes in one response, and a union carrying its own tag is what lets one
 * `SectionList` render them without any of the three guessing at another's
 * fields.
 */
type Row =
  | { kind: 'spot'; key: string; spot: Spot }
  | { kind: 'city'; key: string; city: City }
  | { kind: 'person'; key: string; person: Person }

interface Section {
  title: string
  data: Row[]
}

const toSpotRow = (spot: Spot): Row => ({ kind: 'spot', key: `spot-${spot.uuid}`, spot })
const toCityRow = (city: City): Row => ({ kind: 'city', key: `city-${city.uuid}`, city })
const toPersonRow = (person: Person): Row => ({
  kind: 'person',
  key: `person-${person.uuid}`,
  person,
})

/** Empty sections are dropped rather than rendered as a header over nothing. */
function section(title: string, data: Row[]): Section[] {
  return data.length > 0 ? [{ title, data }] : []
}

/**
 * Fold a single-type page back into the grouped shape, so the render path has
 * one type to read whichever filter produced it. `type` is what the request
 * asked for, and the server answers a typed request with that type only — the
 * rows are not re-inspected to find out what they are.
 */
function groupOneType(
  page: PaginatedResponse<Spot | City | Person>,
  type: DiscoverSearchType,
): DiscoverSearchResults {
  const rows = page.data ?? []

  return {
    spots: type === 'spots' ? (rows as Spot[]) : [],
    cities: type === 'cities' ? (rows as City[]) : [],
    people: type === 'people' ? (rows as Person[]) : [],
  }
}

/**
 * Discovery search across spots, cities and people.
 *
 * This screen called `getSpots()` — the plain `GET /spots` index — until
 * STOURIFY-9, so the people and city indexes were unreachable from the app and
 * the discoverability rule `SearchApiController` applies to spots was never
 * applied. It now queries `GET /discover/search`, which is the surface those
 * three indexes were made Scout-searchable for.
 */
export default function SearchScreen({ navigation }: Props) {
  const theme = useTheme()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const debouncedQuery = useDebounce(query.trim(), 300)

  const isSearchable = debouncedQuery.length >= MIN_QUERY_LENGTH

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['discover-search', filter, debouncedQuery],
    // Both branches resolve to the same grouped shape, so exactly one type
    // flows out of the query and the render path needs no cast to read it.
    queryFn: async (): Promise<DiscoverSearchResults> =>
      filter === 'all'
        ? searchDiscover(debouncedQuery)
        : groupOneType(await searchDiscoverType(debouncedQuery, filter), filter),
    enabled: isSearchable,
  })

  const sections = useMemo<Section[]>(() => {
    if (!data) return []

    return [
      ...section('Spots', data.spots.map(toSpotRow)),
      ...section('Cities', data.cities.map(toCityRow)),
      ...section('People', data.people.map(toPersonRow)),
    ]
  }, [data])

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      const rowStyle = {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: theme.spacing[3],
        paddingHorizontal: theme.gutter,
        paddingVertical: theme.spacing[3],
        minHeight: theme.minTouchTarget,
      }

      if (item.kind === 'spot') {
        const { spot } = item
        const meta = [spot.address, spot.categories?.join(' · ')].filter(Boolean).join(' · ')

        return (
          <Pressable
            style={rowStyle}
            accessibilityRole="button"
            onPress={() => navigation.navigate('SpotDetail', { spotId: spot.uuid })}
          >
            <Text style={{ fontSize: 20 }}>📍</Text>
            <View style={{ flex: 1 }}>
              {/* `title` is what `SpotResource` sends; `name` has never been on the wire. */}
              <Text variant="body">{spot.title}</Text>
              {meta ? (
                <Text variant="caption" color="muted">
                  {meta}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )
      }

      if (item.kind === 'city') {
        const { city } = item
        const place = [city.name, city.region].filter(Boolean).join(', ')

        // Inert on purpose: there is no city screen to navigate to, and a row
        // that looks tappable and does nothing is the defect this card is about.
        return (
          <View style={rowStyle}>
            <Text style={{ fontSize: 20 }}>🏙️</Text>
            <View style={{ flex: 1 }}>
              <Text variant="body">{place}</Text>
              {city.country ? (
                <Text variant="caption" color="muted">
                  {city.country}
                </Text>
              ) : null}
            </View>
          </View>
        )
      }

      const { person } = item

      return (
        <Pressable
          style={rowStyle}
          accessibilityRole="button"
          disabled={!person.user_uuid}
          onPress={() =>
            person.user_uuid && navigation.navigate('Profile', { userId: person.user_uuid })
          }
        >
          <Avatar name={person.name ?? person.username} />
          <View style={{ flex: 1 }}>
            <Text variant="body">{person.name ?? person.username}</Text>
            <Text variant="caption" color="muted">
              @{person.username}
            </Text>
          </View>
        </Pressable>
      )
    },
    [navigation, theme],
  )

  const renderSectionHeader = useCallback(
    ({ section: { title } }: { section: Section }) => (
      <View
        style={{
          paddingHorizontal: theme.gutter,
          paddingTop: theme.spacing[4],
          paddingBottom: theme.spacing[2],
          backgroundColor: theme.colors.surface,
        }}
      >
        <Text variant="micro" color="muted">
          {title}
        </Text>
      </View>
    ),
    [theme],
  )

  /**
   * Only reached with no rows to show, and the four cases are genuinely
   * different situations with different remedies — so they get different
   * words: "we have not been asked yet", "we are still asking", "we could not
   * ask", and "we asked and there is nothing".
   *
   * Before STOURIFY-59 there were three branches and a failed request fell into
   * the last one, so the screen reported that nothing matched when it had never
   * found out. A reader told there are no results searches for something else;
   * a reader told the request failed tries the same search again, which is the
   * one move that helps. The 15-second timeout in `shared/api/client.ts` makes
   * that a routine occurrence rather than an exotic one (STOURIFY-61).
   *
   * Three orderings here are load-bearing:
   *
   * **This lives inside `ListEmptyComponent`**, which renders only when the
   * list has no rows at all — so content always wins over an error. React Query
   * keeps serving the results it already holds while a later fetch fails, and
   * the reader keeps reading them. Hoisting an `isError` check above the
   * `SectionList` would delete that, and never once show it had, because the
   * branch is unreachable while online. `FeedScreen`, `DiscoverScreen` and
   * `NearbyScreen` carry the same warning.
   *
   * **`isSearchable` is asked first.** The query is switched off below the
   * server's two-character minimum, so a query that was never sent is not
   * empty, not loading and not failed — it is unasked, and the prompt is the
   * only honest thing to say. "Nothing typed" and "one character typed" share
   * that prompt on purpose: the remedy is the same sentence for both.
   *
   * **`isFetching` is asked before `isError`**, which differs from `FeedScreen`
   * and `NearbyScreen` and is deliberate. Those two ask `isLoading`, which is
   * false during a retry, so their failure copy stays up while it runs. Here a
   * pressed **Try again** shows "Searching…" instead — the acknowledgement of a
   * button the reader just pressed. Either way the property that matters holds:
   * "No results" never appears during a failed search or its retry.
   */
  const empty = !isSearchable ? (
    <EmptyState
      icon="🔍"
      title="Search Stourify"
      subtitle="Find spots, cities and people. Type at least two characters."
    />
  ) : isFetching ? (
    // A search that is still in flight says so. Rendering nothing left the
    // screen blank for the whole request, which on a slow backend is
    // indistinguishable from a search that returned nothing — found on the
    // emulator, where the round trip is seconds.
    <EmptyState icon="⏳" title="Searching…" subtitle={`Looking for "${debouncedQuery}"`} />
  ) : isError ? (
    <EmptyState
      icon="📡"
      title="Couldn't run your search"
      subtitle="We couldn't reach Stourify just now. Check your connection and try the same search again."
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : (
    <EmptyState icon="🔍" title="No results" subtitle="Try a different word, or another filter." />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View style={{ padding: theme.gutter, gap: theme.spacing[3] }}>
        <Text variant="display">Search</Text>
        <Input
          placeholder="Search spots, cities, people"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      {/*
        `flexGrow: 0` and the inner row are both load-bearing. A horizontal
        ScrollView with no height constraint stretches to fill the space left
        over by the list below it, so the chips rendered as full-height pills
        down the screen — visible immediately on device and invisible to every
        unit test, which asserts on text and not on layout.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: theme.gutter, paddingBottom: theme.spacing[3] }}
      >
        <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
          {FILTERS.map(({ key, label }) => (
            <Chip
              key={key}
              label={label}
              selected={filter === key}
              onPress={() => setFilter(key)}
            />
          ))}
        </View>
      </ScrollView>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderRow}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={empty}
        contentContainerStyle={
          sections.length === 0 ? { flex: 1 } : { paddingBottom: theme.spacing[4] }
        }
      />
    </SafeAreaView>
  )
}

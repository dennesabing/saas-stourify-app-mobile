import { useCallback, useMemo, useState } from 'react'
import { Image } from 'expo-image'
import { Pressable, ScrollView, SectionList, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { DiscoverStackParamList } from '@/shared/navigation/types'
import { searchDiscover, searchDiscoverType } from '@/shared/api/discover'
import { describeRequestFailure } from '@/shared/api/errorMessage'
import { EXPLORE_SPOTS_QUERY_KEY, ratingFor, thumbFor } from '@/features/discover/api/exploreSpots'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useRecentSearches } from '@/features/search/recentSearches'
import {
  Avatar,
  EmptyState,
  Icon,
  SearchField,
  SegmentedControl,
  Text,
} from '@/shared/components/ui'
import { SPOT_CATEGORIES } from '@/shared/config/spotCategories'
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
 * The segmented switch above results. These were six hardcoded category names
 * (`Nature`, `Food`, `History`, …) that no server rule had ever accepted, so
 * pressing one did nothing at all. They are now the endpoint's real `type`
 * selector: `All` is the grouped preview, the rest are one paginated section
 * each (STOURIFY-9). Labels and order match the redesign (STOURIFY-259); the
 * keys and the queries they drive are unchanged — `cities` is the design's
 * "Places".
 */
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'spots', label: 'Spots' },
  { key: 'people', label: 'People' },
  { key: 'cities', label: 'Places' },
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

/** Two-per-row chunks — a manual grid, not `FlatList`'s `numColumns`, because
 * this section sits inside the same scroll view as Recent and a nested
 * virtualised list under a plain `ScrollView` is the classic RN footgun for a
 * grid this small (eight tiles, never paginated). */
function pairsOf<T>(items: readonly T[]): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return rows
}

/**
 * Discovery search across spots, cities and people.
 *
 * This screen called `getSpots()` — the plain `GET /spots` index — until
 * STOURIFY-9, so the people and city indexes were unreachable from the app and
 * the discoverability rule `SearchApiController` applies to spots was never
 * applied. It now queries `GET /discover/search`, which is the surface those
 * three indexes were made Scout-searchable for.
 *
 * Restyled for STOURIFY-259: the field itself is the header (no separate title),
 * a "before you search" state offers Recent and Browse categories in place of
 * the old centred prompt, and the chip rail is now a `SegmentedControl`. Every
 * query, endpoint and empty-state rule below is unchanged.
 */
export default function SearchScreen({ navigation }: Props) {
  const theme = useTheme()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const debouncedQuery = useDebounce(query.trim(), 300)
  const recent = useRecentSearches()

  const isSearchable = debouncedQuery.length >= MIN_QUERY_LENGTH

  const { data, error, isFetching, isError, refetch } = useQuery({
    queryKey: ['discover-search', filter, debouncedQuery],
    // Both branches resolve to the same grouped shape, so exactly one type
    // flows out of the query and the render path needs no cast to read it.
    queryFn: async (): Promise<DiscoverSearchResults> =>
      filter === 'all'
        ? searchDiscover(debouncedQuery)
        : groupOneType(await searchDiscoverType(debouncedQuery, filter), filter),
    enabled: isSearchable,
  })

  /**
   * What the failure panel says under its headline, chosen from the failure
   * that actually happened (STOURIFY-250, following STOURIFY-225).
   *
   * This used to be one fixed sentence about the connection, shown for every
   * way a request can go wrong — including the one where the server picked up
   * and refused. The headline stays this screen's own, "Couldn't run your
   * search": a search is not a load, and the helper's `Couldn't load …` would
   * say the wrong verb. Only the icon and the explanation move.
   */
  const failure = describeRequestFailure(error, 'your search')

  /**
   * Whether the catalogue itself is empty, rather than this search.
   *
   * **A search returning nothing is not evidence of this**, and that is the trap
   * worth naming. "No spot matched `zzzzz`" and "there are no spots" produce an
   * identical empty response, so deciding between them from the search result
   * alone means guessing — and guessing wrong tells someone with a catalogue of
   * five hundred spots that the app is empty.
   *
   * So it asks something that already knows: the explore list behind the
   * Discover tab, which fetched every spot unfiltered and whose answer is in the
   * cache. If that list is empty, there is genuinely nothing to find. If it was
   * never fetched, `getQueryData` returns nothing and this stays `false` — no
   * claim without evidence.
   */
  const queryClient = useQueryClient()
  const exploreSpots = queryClient.getQueryData<Spot[]>(EXPLORE_SPOTS_QUERY_KEY())
  const catalogueIsEmpty = exploreSpots !== undefined && exploreSpots.length === 0

  const hasNothingToSearch =
    catalogueIsEmpty &&
    data !== undefined &&
    data.spots.length === 0 &&
    data.cities.length === 0 &&
    data.people.length === 0

  const sections = useMemo<Section[]>(() => {
    if (!data) return []

    return [
      ...section('Spots', data.spots.map(toSpotRow)),
      ...section('Cities', data.cities.map(toCityRow)),
      ...section('People', data.people.map(toPersonRow)),
    ]
  }, [data])

  /** Committing to a search is what earns it a place under Recent — not every
   * keystroke, which would fill the list with half-typed words. */
  const commitSearch = useCallback(() => {
    const trimmed = query.trim()
    if (trimmed.length >= MIN_QUERY_LENGTH) recent.record(trimmed)
  }, [query, recent.record])

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      const rowStyle = {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: theme.spacing[3],
        paddingHorizontal: theme.gutter,
        paddingVertical: theme.spacing[2],
        minHeight: theme.minTouchTarget,
      }
      const photoStyle = {
        width: 56,
        height: 56,
        borderRadius: theme.radius.button,
        backgroundColor: theme.colors.surfaceAlt,
      }

      if (item.kind === 'spot') {
        const { spot } = item
        const meta = [spot.categories?.join(' · '), spot.address].filter(Boolean).join(' · ')
        const thumb = thumbFor(spot)
        const rating = ratingFor(spot)

        return (
          <Pressable
            style={rowStyle}
            accessibilityRole="button"
            onPress={() => {
              commitSearch()
              navigation.navigate('SpotDetail', { spotId: spot.uuid })
            }}
          >
            <Image
              testID="search-spot-thumb"
              source={thumb ? { uri: thumb } : undefined}
              style={photoStyle}
              contentFit="cover"
              transition={theme.motion.fast}
            />
            <View style={{ flex: 1 }}>
              {/* `title` is what `SpotResource` sends; `name` has never been on the wire. */}
              <Text
                variant="body"
                style={{ fontFamily: theme.fontFamily.bodySemiBold, fontSize: 14 }}
              >
                {spot.title}
              </Text>
              {meta || rating != null ? (
                <Text variant="caption" color="muted">
                  {meta}
                  {rating != null ? (
                    <Text
                      variant="caption"
                      style={{ color: theme.colors.accent2, fontFamily: theme.fontFamily.bodyBold }}
                    >
                      {meta ? ' · ' : ''}★ {rating.toFixed(1)}
                    </Text>
                  ) : null}
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
            <View style={[photoStyle, { alignItems: 'center', justifyContent: 'center' }]}>
              <Icon name="pin" color="muted" />
            </View>
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
          onPress={() => {
            if (!person.user_uuid) return
            commitSearch()
            navigation.navigate('Profile', { userId: person.user_uuid })
          }}
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
    [navigation, theme, commitSearch],
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
   * words: "we are still asking", "we could not ask", and "we asked and there
   * is nothing". The fourth — "we have not been asked yet" — is now the Recent
   * / Browse-categories screen below, not an `EmptyState` here.
   *
   * Before STOURIFY-59 there were three branches and a failed request fell into
   * the last one, so the screen reported that nothing matched when it had never
   * found out. A reader told there are no results searches for something else;
   * a reader told the request failed tries the same search again, which is the
   * one move that helps. The 15-second timeout in `shared/api/client.ts` makes
   * that a routine occurrence rather than an exotic one (STOURIFY-61).
   *
   * Two orderings here are still load-bearing:
   *
   * **This lives inside `ListEmptyComponent`**, which renders only when the
   * list has no rows at all — so content always wins over an error. React Query
   * keeps serving the results it already holds while a later fetch fails, and
   * the reader keeps reading them. Hoisting an `isError` check above the
   * `SectionList` would delete that, and never once show it had, because the
   * branch is unreachable while online. `FeedScreen`, `DiscoverScreen` and
   * `NearbyScreen` carry the same warning.
   *
   * **`isFetching` is asked before `isError`**, which differs from `FeedScreen`
   * and `NearbyScreen` and is deliberate. Those two ask `isLoading`, which is
   * false during a retry, so their failure copy stays up while it runs. Here a
   * pressed **Try again** shows "Searching…" instead — the acknowledgement of a
   * button the reader just pressed. Either way the property that matters holds:
   * "No results" never appears during a failed search or its retry.
   */
  const empty = isFetching ? (
    // A search that is still in flight says so. Rendering nothing left the
    // screen blank for the whole request, which on a slow backend is
    // indistinguishable from a search that returned nothing — found on the
    // emulator, where the round trip is seconds.
    <EmptyState icon="⏳" title="Searching…" subtitle={`Looking for "${debouncedQuery}"`} />
  ) : isError ? (
    <EmptyState
      icon={failure.icon}
      title="Couldn't run your search"
      subtitle={failure.subtitle}
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : hasNothingToSearch ? (
    /*
      "Nothing matched your word" and "there is nothing here to match" are
      different facts, and only one of them is the reader's problem to solve
      (STOURIFY-194).

      Both used to say "No results — try a different word", which blames the
      search. On a catalogue with nothing discoverable in it, that sends someone
      off trying synonyms forever against a set that was never going to answer.

      Distinguishing them needs no extra request: a search that succeeded and
      returned nothing across ALL THREE sections, on the unfiltered tab, is
      already the evidence. One section being empty says nothing; three say the
      catalogue is.
    */
    <EmptyState
      icon="🌱"
      title="There is nothing to find yet"
      subtitle="No spots, cities or people have been added here yet. This is not your search — try again once there is something to look for."
    />
  ) : (
    <EmptyState icon="🔍" title="No results" subtitle="Try a different word, or another filter." />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      {/* The design's `.bb` row: the field itself is the header, no separate
          title above it (STOURIFY-259). */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[3],
          paddingTop: theme.spacing[1],
          paddingHorizontal: theme.gutter,
          paddingBottom: theme.spacing[2],
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={(theme.minTouchTarget - 38) / 2}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="back" size={20} />
        </Pressable>
        <SearchField
          placeholder="Search spots, cities, people"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={commitSearch}
          autoFocus
          style={{ flex: 1 }}
        />
      </View>

      {!isSearchable ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
          {recent.queries.length > 0 ? (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingHorizontal: theme.gutter,
                  paddingTop: theme.spacing[2],
                  paddingBottom: theme.spacing[1],
                }}
              >
                <Text variant="micro" color="muted">
                  Recent
                </Text>
                <Pressable onPress={recent.clear} accessibilityRole="button">
                  <Text variant="micro" color="primary">
                    Clear
                  </Text>
                </Pressable>
              </View>

              {recent.queries.map((recentQuery) => (
                <View
                  key={recentQuery}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing[3],
                    paddingHorizontal: theme.gutter,
                    paddingVertical: theme.spacing[2],
                    minHeight: theme.minTouchTarget,
                  }}
                >
                  <Icon name="clock" size={18} color="muted" />
                  <Pressable
                    style={{ flex: 1 }}
                    accessibilityRole="button"
                    onPress={() => setQuery(recentQuery)}
                  >
                    <Text variant="body">{recentQuery}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => recent.remove(recentQuery)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${recentQuery}`}
                    hitSlop={theme.spacing[2]}
                  >
                    <Icon name="close" size={16} color="muted" />
                  </Pressable>
                </View>
              ))}
            </>
          ) : null}

          <Text
            variant="caption"
            color="muted"
            style={{ paddingHorizontal: theme.gutter, paddingVertical: theme.spacing[2] }}
          >
            Type at least two characters to search spots, cities and people.
          </Text>

          <Text
            variant="micro"
            color="muted"
            style={{
              paddingHorizontal: theme.gutter,
              paddingTop: theme.spacing[1],
              paddingBottom: theme.spacing[2],
            }}
          >
            Browse categories
          </Text>
          <View style={{ paddingHorizontal: theme.gutter, gap: theme.spacing[2] }}>
            {pairsOf(SPOT_CATEGORIES).map((pair) => (
              <View key={pair.join('-')} style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
                {pair.map((category) => (
                  <Pressable
                    key={category}
                    accessibilityRole="button"
                    onPress={() => navigation.navigate('Discover', { category })}
                    style={{
                      flex: 1,
                      height: 74,
                      borderRadius: 14,
                      backgroundColor: theme.colors.badgeBg,
                      justifyContent: 'flex-end',
                      padding: theme.spacing[3],
                    }}
                  >
                    <Text
                      color="badgeInk"
                      style={{ fontFamily: theme.fontFamily.bodyBold, fontSize: 14 }}
                    >
                      {category}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <>
          <View style={{ paddingHorizontal: theme.gutter, paddingBottom: theme.spacing[3] }}>
            <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
          </View>

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
        </>
      )}
    </SafeAreaView>
  )
}

import { useState, useCallback } from 'react'
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { SearchStackParamList } from '@/shared/navigation/types'
import { getSpots } from '@/shared/api/spots'
import { useDebounce } from '@/shared/hooks/useDebounce'
import EmptyState from '@/shared/components/EmptyState'
import type { Spot } from '@/shared/api/types'

type Props = NativeStackScreenProps<SearchStackParamList, 'Search'>

const CATEGORIES = ['All', 'Nature', 'Food', 'History', 'Art', 'Beach']

export default function SearchScreen({ navigation }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: ['spots', debouncedSearch, category],
    queryFn: () => getSpots({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(category !== 'All' ? { category: category.toLowerCase() } : {}),
    }),
  })

  const spots = data?.data ?? []

  const renderCategoryChip = useCallback(
    ({ item }: { item: string }) => (
      <TouchableOpacity
        style={[styles.chip, category === item && styles.chipActive]}
        onPress={() => setCategory(item)}
      >
        <Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text>
      </TouchableOpacity>
    ),
    [category],
  )

  const renderSpotRow = useCallback(
    ({ item }: { item: Spot }) => (
      <TouchableOpacity
        style={styles.spotRow}
        onPress={() => navigation.navigate('SpotDetail', { spotId: item.uuid })}
      >
        <View style={styles.spotIcon}>
          <Text style={{ fontSize: 20 }}>📍</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.spotName}>{item.name}</Text>
          <Text style={styles.spotMeta}>
            {item.address ?? ''}{item.address && item.category?.name ? ' · ' : ''}{item.category?.name ?? ''}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [navigation],
  )

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Discover</Text>

      <TextInput
        style={styles.searchBar}
        placeholder="Search spots..."
        placeholderTextColor="#888"
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(c) => c}
        renderItem={renderCategoryChip}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
        showsHorizontalScrollIndicator={false}
      />

      <FlatList
        data={spots}
        keyExtractor={(s) => s.uuid}
        renderItem={renderSpotRow}
        ListEmptyComponent={
          !isLoading
            ? () => <EmptyState icon="🔍" title="No spots found" subtitle="Try a different search term" />
            : null
        }
        contentContainerStyle={spots.length === 0 ? { flex: 1 } : { paddingBottom: 16 }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  header: { fontSize: 28, fontWeight: 'bold', color: '#fff', padding: 16, paddingBottom: 12 },
  searchBar: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, color: '#fff', marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', marginRight: 8 },
  chipActive: { backgroundColor: '#00b4d8' },
  chipText: { color: '#aaa', fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  spotRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 12 },
  spotIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(0,180,216,0.15)', alignItems: 'center', justifyContent: 'center' },
  spotName: { color: '#fff', fontWeight: '600', fontSize: 15 },
  spotMeta: { color: '#aaa', fontSize: 12, marginTop: 2 },
})

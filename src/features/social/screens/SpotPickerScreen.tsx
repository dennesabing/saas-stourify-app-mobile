import { useState, useCallback } from 'react'
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { getSpots } from '@/shared/api/spots'
import { useDebounce } from '@/shared/hooks/useDebounce'
import type { Spot } from '@/shared/api/types'
import { useUIStore } from '@/shared/store'

type Props = NativeStackScreenProps<CreateStackParamList, 'SpotPicker'>

export default function SpotPickerScreen({ navigation }: Props) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const { setPendingSpot } = useUIStore()

  const { data } = useQuery({
    queryKey: ['spots-picker', debouncedSearch],
    queryFn: () => getSpots(debouncedSearch ? { search: debouncedSearch } : {}),
    enabled: debouncedSearch.length > 1,
  })

  const spots = data?.data ?? []

  const renderSpot = useCallback(
    ({ item }: { item: Spot }) => (
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          setPendingSpot(item)
          navigation.goBack()
        }}
      >
        <View style={styles.icon}><Text>📍</Text></View>
        <View>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>{item.address ?? ''}</Text>
        </View>
      </TouchableOpacity>
    ),
    [navigation, setPendingSpot],
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          setPendingSpot(null)
          navigation.goBack()
        }}>
          <Text style={styles.cancel}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Tag a Spot</Text>
        <View style={{ width: 40 }} />
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search spots..."
        placeholderTextColor="#888"
        value={search}
        onChangeText={setSearch}
        autoFocus
      />

      <FlatList
        data={spots}
        keyExtractor={(s) => s.uuid}
        renderItem={renderSpot}
        ListFooterComponent={() => (
          <TouchableOpacity style={styles.createBtn} onPress={() => { setPendingSpot(null); navigation.goBack() }}>
            <Text style={styles.createText}>+ Create new spot here</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 48 },
  cancel: { color: '#fff', fontSize: 20 },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  search: { backgroundColor: 'rgba(255,255,255,0.1)', margin: 16, borderRadius: 12, padding: 14, color: '#fff', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(0,180,216,0.15)', alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontWeight: '600', fontSize: 15 },
  meta: { color: '#aaa', fontSize: 12 },
  createBtn: { padding: 20, alignItems: 'center' },
  createText: { color: '#00b4d8', fontWeight: '600' },
})

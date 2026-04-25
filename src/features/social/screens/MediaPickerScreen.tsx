import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CreateStackParamList } from '@/shared/navigation/types'

type Props = NativeStackScreenProps<CreateStackParamList, 'MediaPicker'>

export default function MediaPickerScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<ImagePicker.ImagePickerAsset[]>([])

  useEffect(() => {
    let cancelled = false
    ImagePicker.requestMediaLibraryPermissionsAsync()
      .then(({ status }) => {
        if (cancelled || status !== 'granted') return
        return ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: true,
          selectionLimit: 10,
          quality: 0.8,
        })
      })
      .then((result) => {
        if (cancelled || !result || result.canceled) return
        const assets = result.assets
        setSelected(assets)
        navigation.navigate('PostCompose', {
          mediaAssets: assets.map((a) => ({ uri: a.uri, type: a.mimeType, fileName: a.fileName ?? undefined })),
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [navigation])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Post</Text>
        <TouchableOpacity
          onPress={() => {
            if (selected.length > 0) {
              navigation.navigate('PostCompose', {
                mediaAssets: selected.map((a) => ({ uri: a.uri, type: a.mimeType, fileName: a.fileName ?? undefined })),
              })
            }
          }}
          disabled={selected.length === 0}
        >
          <Text style={[styles.next, selected.length === 0 && { opacity: 0.4 }]}>Next →</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.hint}>
        <Text style={styles.hintText}>Opening gallery…</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 48 },
  cancel: { color: '#fff', fontSize: 20 },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  next: { color: '#00b4d8', fontWeight: '700' },
  hint: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hintText: { color: '#aaa' },
})

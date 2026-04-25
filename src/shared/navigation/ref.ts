import { createNavigationContainerRef, CommonActions } from '@react-navigation/native'
import type { RootStackParamList } from './types'

export const navigationRef = createNavigationContainerRef<RootStackParamList>()

export function navigateTo(name: keyof RootStackParamList) {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(CommonActions.navigate({ name }))
  }
}

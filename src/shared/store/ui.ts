import { create } from 'zustand'
import type { Spot } from '@/shared/api/types'

interface UIState {
  pendingSpot: Spot | null
  setPendingSpot: (spot: Spot | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  pendingSpot: null,
  setPendingSpot: (spot) => set({ pendingSpot: spot }),
}))

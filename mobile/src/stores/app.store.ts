import { create } from 'zustand'

interface AppState {
  isOnline: boolean
  isOfflineModeActive: boolean
  setOnline: (value: boolean) => void
  setOfflineMode: (value: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: true,
  isOfflineModeActive: false,
  setOnline: (value) => set((state) => ({ ...state, isOnline: value })),
  setOfflineMode: (value) => set((state) => ({ ...state, isOfflineModeActive: value })),
}))

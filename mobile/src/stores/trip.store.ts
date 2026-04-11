import { create } from 'zustand'
import type { Trip } from '@/services/trip.service'

interface TripState {
  activeTrip: Trip | null
  isLoading: boolean
  error: string | null
  setActiveTrip: (trip: Trip | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useTripStore = create<TripState>((set) => ({
  activeTrip: null,
  isLoading: false,
  error: null,
  setActiveTrip: (trip) => set({ activeTrip: trip }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set({ activeTrip: null, isLoading: false, error: null }),
}))

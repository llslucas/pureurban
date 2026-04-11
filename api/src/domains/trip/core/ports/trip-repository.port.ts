import { Context, Effect } from 'effect'
import type { TripNotFound } from '../errors/trip.errors.js'

// Tipos de dados do domínio Trip — Effect TS puro, zero imports @nestjs/*

export interface TripData {
  id: string
  companyId: string
  routeId: string
  driverId: string
  type: 'OUTBOUND' | 'RETURN'
  status: 'ACTIVE' | 'COMPLETED'
  startedAt: Date
  endedAt: Date | null
  relatedTripId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateTripData {
  companyId: string
  routeId: string
  driverId: string
  type: 'OUTBOUND' | 'RETURN'
  status: 'ACTIVE'
  startedAt: Date
  relatedTripId?: string
}

export interface TripRepositoryApi {
  create(data: CreateTripData): Effect.Effect<TripData, never, never>
  findById(id: string, tenantId: string): Effect.Effect<TripData, TripNotFound, never>
  update(id: string, data: Partial<TripData>, tenantId: string): Effect.Effect<TripData, TripNotFound, never>
  findActiveByDriver(driverId: string, tenantId: string): Effect.Effect<TripData | null, never, never>
}

// Context Tag para injeção no Effect runtime
export class TripRepository extends Context.Tag('TripRepository')<TripRepository, TripRepositoryApi>() {}

import { Effect } from 'effect'
import { TripRepository } from '../ports/trip-repository.port.js'
import { noEvents } from '../../../shared/core/events/with-events.js'
import type { WithEvents } from '../../../shared/core/events/index.js'
import type { TripData } from '../ports/trip-repository.port.js'

export interface GetActiveTripInput {
  driverId: string
  tenantId: string
}

export const getActiveTrip = (
  input: GetActiveTripInput,
): Effect.Effect<WithEvents<TripData | null>, never, TripRepository> =>
  Effect.gen(function* () {
    const repo = yield* TripRepository
    const trip = yield* repo.findActiveByDriver(input.driverId, input.tenantId)
    return noEvents(trip)
  })

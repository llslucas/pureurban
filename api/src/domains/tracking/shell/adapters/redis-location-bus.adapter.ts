import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { RedisService } from '../../../shared/shell/infra/redis.service.js';
import type {
  LocationBusApi,
  LocationSample,
  LocationUpdatedEvent,
} from '../../core/ports/location-bus.port.js';
import { toInfraError } from '../../../shared/shell/infra/to-infra-error.js';

// Mesmo envelope {type, data} do boarding, consumível pelo stream SSE da 5.2.
export const trackingChannel = (tripId: string): string =>
  `tracking:trip:${tripId}`;

// TTL 60s = bem acima da janela de 15s de "Sem sinal GPS" da 5.2 (evita 404
// durante indisponibilidade transitória) e curto o bastante para
// NO_LOCATION_AVAILABLE após ~1min sem GPS.
export const LOCATION_TTL_SECONDS = 60;

const locationKey = (tripId: string): string =>
  `tracking:trip:${tripId}:location`;

@Injectable()
export class RedisLocationBusAdapter implements LocationBusApi {
  constructor(private readonly redis: RedisService) {}

  store(tripId: string, location: LocationSample): Effect.Effect<void> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.redis.setex(
            locationKey(tripId),
            LOCATION_TTL_SECONDS,
            JSON.stringify(location),
          ),
        catch: toInfraError('Falha ao armazenar posição no Redis'),
      }),
      Effect.asVoid,
      Effect.orDie,
    );
  }

  latest(tripId: string): Effect.Effect<LocationSample | null> {
    return pipe(
      Effect.tryPromise({
        try: async () => {
          const raw = await this.redis.get(locationKey(tripId));
          return raw ? (JSON.parse(raw) as LocationSample) : null;
        },
        catch: toInfraError('Falha ao ler posição do Redis'),
      }),
      Effect.orDie,
    );
  }

  publish(tripId: string, event: LocationUpdatedEvent): Effect.Effect<void> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.redis.publish(trackingChannel(tripId), JSON.stringify(event)),
        catch: toInfraError('Falha ao publicar posição no canal da viagem'),
      }),
      Effect.asVoid,
      Effect.orDie,
    );
  }
}

import { Context, Effect } from 'effect';

// Amostra crua do device: o capturedAt é só eco do que o motorista enviou —
// os instantes do servidor (receivedAt/timestamp) nunca entram aqui.
export interface LocationSample {
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: string;
}

// Shape do evento no canal `tracking:trip:{tripId}` — envelope {type, data} do
// boarding, consumível pelo stream SSE da 5.2. É contrato da 5.0
// (LocationUpdatedEventDto), então o payload exato vive aqui no core.
export interface LocationUpdatedEvent {
  type: 'location.updated';
  data: {
    tripId: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp: string;
  };
}

export interface LocationBusApi {
  // Last-write-wins: grava a amostra sob a key da viagem com TTL curto,
  // sobrescrevendo qualquer posição anterior.
  store(tripId: string, location: LocationSample): Effect.Effect<void>;

  // null quando: cache vazio ou TTL expirado (→ NO_LOCATION_AVAILABLE, 404).
  latest(tripId: string): Effect.Effect<LocationSample | null>;

  // Publica o evento no canal da viagem para os subscribers (stream 5.2).
  publish(tripId: string, event: LocationUpdatedEvent): Effect.Effect<void>;
}

export class LocationBus extends Context.Tag('tracking.LocationBus')<
  LocationBus,
  LocationBusApi
>() {}

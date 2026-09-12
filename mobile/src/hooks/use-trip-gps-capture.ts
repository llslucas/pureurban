import { useEffect, useMemo, useRef } from 'react'
import * as Location from 'expo-location'

import { trackingService } from '@/services/tracking.service'
import type { LocationIngestRequest } from '@/services/tracking.service'
import {
  createGpsCapture,
  createTimeoutSchedule,
  type GpsPosition,
} from '@/utils/gps-capture'

/**
 * Adaptação do controlador puro (utils/gps-capture) ao app: expo-location +
 * timers reais. O gate da captura é externo e reativo: `tripId` só chega
 * preenchido quando a viagem do cache do react-query está ACTIVE, e
 * `permissionGranted` só quando a permissão foreground foi concedida —
 * qualquer um dos dois cair a zero PARA a captura sozinha (NFR10), sem toque
 * manual e sem POST fora de viagem ativa.
 */
export function useTripGpsCapture(
  tripId: string | null,
  permissionGranted: boolean,
): void {
  // O send lê o tripId corrente por ref: um tick agendado no fim da viagem
  // nunca deve partir com o id de outra (ou de viagem nenhuma).
  const tripIdRef = useRef(tripId)
  useEffect(() => {
    tripIdRef.current = tripId
  })

  const capture = useMemo(
    () =>
      createGpsCapture({
        getLocation: async (): Promise<GpsPosition> => {
          // Accuracy Balanced: precisão suficiente para proximidade (o épico
          // quer distância/ETA, não cartografia) sem drenar bateria.
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
          return {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            ...(location.coords.accuracy != null && {
              accuracy: location.coords.accuracy,
            }),
            capturedAt: new Date(location.timestamp).toISOString(),
          }
        },
        send: (position) => {
          const currentTripId = tripIdRef.current
          // Corrida de encerramento: stop() já foi pedido; não há viagem para
          // onde enviar. Resolve vazio — a posição é descartável por contrato.
          if (!currentTripId) return Promise.resolve()
          const body: LocationIngestRequest = {
            tripId: currentTripId,
            ...position,
          }
          return trackingService.ingestLocation(body)
        },
        schedule: createTimeoutSchedule(),
      }),
    [],
  )

  useEffect(() => {
    if (tripId && permissionGranted) {
      capture.start()
    } else {
      capture.stop()
    }
    // Desmontar a tela também para a captura — sem timer sobrevivente.
    return () => capture.stop()
  }, [capture, permissionGranted, tripId])
}

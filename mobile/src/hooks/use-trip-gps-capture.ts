import { useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as Location from 'expo-location'

import { activeTripKey } from '@/lib/trip-queries'
import { trackingService } from '@/services/tracking.service'
import type { LocationIngestRequest } from '@/services/tracking.service'
import { ApiClientError } from '@/services/api-error'
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
  const queryClient = useQueryClient()

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
        classifySendError: (error) => {
          // 409 TRIP_NOT_ACTIVE / 403: a viagem acabou para este motorista
          // fora deste device (2º device, ação admin) — postar de novo só
          // reproduziria o mesmo erro para sempre. Para a captura e devolve
          // a descoberta ao polling: o gate reativo (tripId → null) faz o
          // resto. Falha de transporte (status 0) e 5xx são transitórias.
          const deterministic =
            error instanceof ApiClientError &&
            (error.status === 409 || error.status === 403)
          if (deterministic) {
            void queryClient.invalidateQueries({ queryKey: activeTripKey })
          }
          // Transmissão morta em silêncio era o achado R3: toda falha loga.
          console.warn('[gps-capture] falha ao transmitir posição:', error)
          return deterministic ? 'fatal' : 'transient'
        },
      }),
    [queryClient],
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

import * as Crypto from 'expo-crypto'
import { router } from 'expo-router'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Card, Dialog, Portal, Snackbar, Text } from 'react-native-paper'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiClientError } from '@/services/api-error'
import {
  boardingService,
  type NotReturningResponse,
} from '@/services/boarding.service'
import { tripService } from '@/services/trip.service'
import { useAuthStore } from '@/stores/auth.store'

// Valor do cache ['studentAbsence', tripId]. `absence: null` significa "o
// servidor confirmou ausência ativa, mas a janela é desconhecida" (resposta de
// um 409 ALREADY_NOT_RETURNING reidratado) — o estado já nasce consolidado.
interface StudentAbsenceCache {
  registered: true
  absence: NotReturningResponse | null
}

// Cada erro tipado do contrato tem mensagem clara em pt-BR. ALREADY_NOT_RETURNING
// não está aqui: não é erro nesta tela, vira estado registrado (onError).
const ERROR_MESSAGES: Record<string, string> = {
  STUDENT_NOT_ON_TRIP: 'Você não pertence à rota desta viagem.',
  TRIP_NOT_ACTIVE: 'A viagem não está mais ativa.',
  ALREADY_CHECKED_IN: 'Você já embarcou nesta viagem. Fale com o motorista.',
  CANCELLATION_PERIOD_EXPIRED:
    'O tempo para cancelar pelo app passou. Avise o motorista pessoalmente.',
  ABSENCE_NOT_FOUND: 'Não há registro de ausência para cancelar.',
}

const formatCountdown = (ms: number) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function StudentHomeScreen() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // Mesma key do motorista (`['activeTrip']`): para o aluno a API devolve a
  // viagem de retorno ativa na rota dele (ou null) — a decisão de qual viagem
  // é do backend, a tela só consome.
  const { data: activeTrip, status: tripStatus } = useQuery({
    queryKey: ['activeTrip'],
    queryFn: () => tripService.getActiveTrip(),
    staleTime: 10_000,
    retry: 2,
  })

  const tripId = activeTrip?.status === 'ACTIVE' ? activeTrip.id : null

  // Sem queryFn real: a ausência não tem GET — o cache é escrito pela mutation
  // (setQueryData) e reidratado do MMKV (persistido 24h). Depois disso, o
  // re-registro cai no 409 ALREADY_NOT_RETURNING e volta a este estado.
  const { data: absenceCache } = useQuery<StudentAbsenceCache | null>({
    queryKey: ['studentAbsence', tripId ?? 'none'],
    queryFn: () => null,
    enabled: Boolean(tripId),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  })

  // Pending check-in reminder (Story 4.4): the server derives it at read
  // time — the same outcome the driver sees on the stream. No polling: the
  // banner is read on mount/remount (after staleTime) and refreshed by the
  // explicit cache removals after each action — React Native has no window
  // focus, so while the screen sits open it does not live-refresh (push is
  // Fase 2). A GET failure only hides the banner — the screen never depends
  // on it.
  const { data: pendingReminder } = useQuery({
    queryKey: ['studentReminder', tripId ?? 'none'],
    queryFn: () => boardingService.getPendingReminder(),
    enabled: Boolean(tripId),
  })

  const [dialogVisible, setDialogVisible] = React.useState(false)
  const [snackbarVisible, setSnackbarVisible] = React.useState(false)
  const [snackbarMessage, setSnackbarMessage] = React.useState('')
  // Chave da tentativa corrente: gerada no primeiro toque em "Confirmar" e
  // mantida até o desfecho — um segundo toque durante o envio reenvia a MESMA
  // key, e o servidor deduplica (padrão do scan.tsx).
  const attemptKeyRef = React.useRef<string | null>(null)

  const notifyMutation = useMutation({
    mutationFn: (currentTripId: string) => {
      if (!attemptKeyRef.current) {
        attemptKeyRef.current = Crypto.randomUUID()
      }
      return boardingService.notifyNotReturning(
        currentTripId,
        attemptKeyRef.current,
      )
    },
    onSuccess: (absence, currentTripId) => {
      // Cache sob o tripId que a mutation recebeu, não o do render: o escopo
      // pode ter mudado (viagem encerrada/aberta) enquanto o envio voava.
      queryClient.setQueryData<StudentAbsenceCache>(
        ['studentAbsence', currentTripId],
        { registered: true, absence },
      )
      // The reminder (4.4) converges to the same outcome as the absence:
      // without the removal the banner would survive the success — the GET
      // refetch brings null, but the stale cache would answer first.
      queryClient.removeQueries({ queryKey: ['studentReminder', currentTripId] })
      attemptKeyRef.current = null
      setDialogVisible(false)
    },
    onError: (error, currentTripId) => {
      attemptKeyRef.current = null
      setDialogVisible(false)

      if (error instanceof ApiClientError && error.code === 'ALREADY_NOT_RETURNING') {
        // Reinstalação com cache >24h: a ausência existe no servidor, então
        // registrar de novo "falhou" — mas para o aluno é sucesso consolidado,
        // sem countdown (a janela de 2 min certamente expirou).
        queryClient.setQueryData<StudentAbsenceCache>(
          ['studentAbsence', currentTripId],
          { registered: true, absence: null },
        )
        return
      }

      setSnackbarMessage(
        error instanceof ApiClientError
          ? (ERROR_MESSAGES[error.code] ?? error.message)
          : 'Não foi possível registrar a ausência. Tente novamente.',
      )
      setSnackbarVisible(true)
    },
  })

  // Key por tentativa do CANCELAMENTO, separada da do registro: cada operação
  // tem replay próprio no servidor (a cancel key persiste na linha anulada).
  const cancelAttemptKeyRef = React.useRef<string | null>(null)

  const cancelMutation = useMutation({
    mutationFn: (currentTripId: string) => {
      if (!cancelAttemptKeyRef.current) {
        cancelAttemptKeyRef.current = Crypto.randomUUID()
      }
      return boardingService.cancelAbsence(
        currentTripId,
        cancelAttemptKeyRef.current,
      )
    },
    onSuccess: (_cancellation, currentTripId) => {
      // Sucesso = voltar ao ramo normal: "Não vou voltar" volta a ficar
      // disponível e não existe estado "retorno confirmado" — o próprio ramo
      // normal é o estado confirmado do cancelamento.
      // removeQueries e não setQueryData(key, undefined): no TanStack v5 um
      // resultado undefined é NO-OP — o cache só sai da key com remoção.
      queryClient.removeQueries({ queryKey: ['studentAbsence', currentTripId] })
      // Cancelar reabre a pendência no servidor (ausência anulada, linha do
      // lembrete intacta): sem a remoção o cache null responderia primeiro e
      // o banner só voltaria no próximo remount.
      queryClient.removeQueries({ queryKey: ['studentReminder', currentTripId] })
      cancelAttemptKeyRef.current = null
    },
    onError: (error, currentTripId) => {
      cancelAttemptKeyRef.current = null

      // As duas corridas conhecidas reescrevem o cache antes da mensagem —
      // a tela nunca trava num estado que o servidor já não confirma.
      if (error instanceof ApiClientError) {
        if (error.code === 'CANCELLATION_PERIOD_EXPIRED') {
          // A janela fechou no meio do envio: o servidor MANTÉM a ausência —
          // cache consolidado (sem countdown), como se tivesse expirado em paz.
          queryClient.setQueryData<StudentAbsenceCache>(
            ['studentAbsence', currentTripId],
            { registered: true, absence: null },
          )
        } else if (error.code === 'ABSENCE_NOT_FOUND') {
          // Estado local velho (cache mais novo que o servidor): nada a
          // cancelar — limpa e volta ao ramo normal (removeQueries: v5 trata
          // setQueryData(key, undefined) como no-op, ver onSuccess).
          queryClient.removeQueries({
            queryKey: ['studentAbsence', currentTripId],
          })
        }
      }

      setSnackbarMessage(
        error instanceof ApiClientError
          ? (ERROR_MESSAGES[error.code] ?? error.message)
          : 'Não foi possível cancelar a ausência. Tente novamente.',
      )
      setSnackbarVisible(true)
    },
  })

  // Ticking local de 1s derivado de cancellableUntil — o cliente NUNCA
  // recalcula a janela, só exibe o countdown com o valor do servidor.
  const [nowMs, setNowMs] = React.useState(() => Date.now())
  const expiryMs =
    absenceCache?.absence !== null && absenceCache?.absence !== undefined
      ? Date.parse(absenceCache.absence.cancellableUntil)
      : null
  const isCounting = expiryMs !== null && nowMs < expiryMs

  React.useEffect(() => {
    if (!isCounting) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isCounting])

  const registered = Boolean(absenceCache)
  const windowExpired = !isCounting

  const handleConfirm = () => {
    if (!tripId) return
    notifyMutation.mutate(tripId)
  }

  // O tripId é capturado no toque (argumento da mutation), não no render: o
  // escopo pode mudar enquanto o cancelamento voa (padrão do notifyMutation).
  const handleCancel = () => {
    if (!tripId) return
    cancelMutation.mutate(tripId)
  }

  const handleDismissDialog = () => {
    // Enquanto o envio está em curso, a tentativa continua viva: descartar o
    // dialog não descarta a mutation, e manter a MESMA key faz um re-confirmo
    // reenviar o que já saiu em vez de registrar ausência duas vezes.
    if (!notifyMutation.isPending) {
      attemptKeyRef.current = null
    }
    setDialogVisible(false)
  }

  const tripHint =
    tripStatus === 'pending'
      ? 'Carregando sua viagem...'
      : tripStatus === 'error'
        ? 'Não foi possível verificar sua viagem. Verifique sua conexão.'
        : 'Sem viagem de retorno ativa. O aviso fica disponível quando ela começar.'

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.greeting}>
        Olá, {user?.name ?? 'aluno'}
      </Text>

      <View>
        {/* Contagem de toques da AC #5: login leva a home (0 toques) → 1 toque aqui → QR na tela. */}
        <Button
          mode="contained"
          contentStyle={styles.buttonContent}
          // navigate, não push: dois toques rápidos empilhavam duas telas de QR
          // (duas queries, dois backs) antes da transição terminar.
          onPress={() => router.navigate('/(student)/qr-code')}
        >
          Meu QR Code
        </Button>

        {/* Reminder (4.4) between the QR and the absence branch: it answers
            with the EXACT 4.1 mutation — the banner only opens the existing
            dialog. It disappears when the absence is registered or the GET
            returns null (pending state resolved). */}
        {pendingReminder && !registered ? (
          <Card mode="outlined" style={styles.reminderBanner}>
            <Card.Content style={styles.reminderContent}>
              <Text variant="titleSmall">E a volta?</Text>
              <Text variant="bodyMedium" style={styles.reminderHint}>
                Você ainda não confirmou o retorno. Se não vai voltar, avise o
                motorista.
              </Text>
              <Button
                mode="contained"
                contentStyle={styles.buttonContent}
                icon="bus-alert"
                onPress={() => setDialogVisible(true)}
              >
                Não vou voltar
              </Button>
            </Card.Content>
          </Card>
        ) : null}

        {registered ? (
          <Card mode="elevated" style={styles.absenceCard}>
            <Card.Content style={styles.absenceContent}>
              <Text variant="titleMedium">Ausência registrada</Text>
              <Text variant="bodyMedium" style={styles.absenceHint}>
                O motorista já foi avisado de que você não vai voltar.
              </Text>
              {windowExpired ? null : (
                <>
                  <Text variant="titleMedium" style={styles.countdown}>
                    Janela de cancelamento{' '}
                    {formatCountdown((expiryMs ?? 0) - nowMs)}
                  </Text>
                  <Button
                    mode="outlined"
                    contentStyle={styles.buttonContent}
                    icon="undo-variant"
                    disabled={!tripId || cancelMutation.isPending}
                    loading={cancelMutation.isPending}
                    onPress={handleCancel}
                  >
                    Cancelar
                  </Button>
                </>
              )}
            </Card.Content>
          </Card>
        ) : (
          <>
            <Button
              mode="contained-tonal"
              contentStyle={styles.buttonContent}
              icon="bus-alert"
              disabled={!tripId || notifyMutation.isPending}
              onPress={() => setDialogVisible(true)}
              style={styles.absenceButton}
            >
              Não vou voltar
            </Button>
            {!tripId ? (
              <Text variant="bodySmall" style={styles.tripHint}>
                {tripHint}
              </Text>
            ) : null}
          </>
        )}
      </View>

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={handleDismissDialog}>
          <Dialog.Title>Não vou voltar?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              O motorista será avisado agora de que você não vai voltar no
              ônibus.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handleDismissDialog}>Voltar</Button>
            <Button
              onPress={handleConfirm}
              loading={notifyMutation.isPending}
              disabled={notifyMutation.isPending || !tripId}
            >
              Confirmar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  greeting: {
    textAlign: 'center',
  },
  buttonContent: {
    paddingVertical: 10,
  },
  absenceButton: {
    marginTop: 16,
  },
  tripHint: {
    textAlign: 'center',
    opacity: 0.7,
    marginTop: 8,
  },
  absenceCard: {
    borderRadius: 16,
  },
  reminderBanner: {
    borderRadius: 16,
  },
  reminderContent: {
    alignItems: 'center',
    gap: 8,
  },
  reminderHint: {
    textAlign: 'center',
    opacity: 0.7,
  },
  absenceContent: {
    alignItems: 'center',
    gap: 8,
  },
  absenceHint: {
    textAlign: 'center',
    opacity: 0.7,
  },
  countdown: {
    fontVariant: ['tabular-nums'],
  },
})

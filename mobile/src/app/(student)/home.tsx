import * as Crypto from 'expo-crypto'
import { router } from 'expo-router'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Card, Dialog, Portal, Snackbar, Text } from 'react-native-paper'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiClientError } from '@/services/api-error'
import {
  boardingService,
  type StudentBoardingStatusResponse,
} from '@/services/boarding.service'
import {
  activeTripOptions,
  studentBoardingStatusKey,
  studentBoardingStatusOptions,
} from '@/lib/trip-queries'
import { useAuthStore } from '@/stores/auth.store'

// While the home is open it must notice the driver starting the return and
// scanning the student. Paused in background by the focusManager (app-focus).
const HOME_POLL_MS = 15_000

// Outcomes that mean "the local state is behind the server": the screen
// refetches the status instead of guessing.
const STATUS_RACE_CODES = new Set([
  'ALREADY_NOT_RETURNING',
  'ALREADY_CHECKED_IN',
  'CANCELLATION_PERIOD_EXPIRED',
  'ABSENCE_NOT_FOUND',
])

// Cada erro tipado do contrato tem mensagem clara em pt-BR. ALREADY_NOT_RETURNING
// não está aqui: não é erro nesta tela, o status refeito mostra a ausência.
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

  // Mesma entrada de cache do motorista (factory `activeTripOptions`): para o
  // aluno a API devolve a viagem de retorno ativa na rota dele (ou null). O
  // polling é só desta tela — o motorista usa a factory sem ele.
  const { data: activeTrip, status: tripStatus } = useQuery({
    ...activeTripOptions(),
    refetchInterval: HOME_POLL_MS,
  })

  const tripId = activeTrip?.status === 'ACTIVE' ? activeTrip.id : null

  // The server is the source of truth for check-in/absence on the return.
  // A failed GET keeps the last known state and retries on the next cycle.
  const { data: serverStatus } = useQuery({
    ...studentBoardingStatusOptions(tripId),
    refetchInterval: HOME_POLL_MS,
  })
  const boardingStatus: StudentBoardingStatusResponse | null =
    serverStatus && serverStatus.tripId === tripId ? serverStatus : null

  // Pending check-in reminder (Story 4.4): the server derives it at read
  // time — the same outcome the driver sees on the stream. A GET failure
  // only hides the banner — the screen never depends on it.
  const { data: pendingReminder } = useQuery({
    queryKey: ['studentReminder', tripId ?? 'none'],
    queryFn: () => boardingService.getPendingReminder(),
    enabled: Boolean(tripId),
    refetchInterval: HOME_POLL_MS,
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
    onSuccess: async (absence, currentTripId) => {
      // Cache sob o tripId que a mutation recebeu, não o do render: o escopo
      // pode ter mudado (viagem encerrada/aberta) enquanto o envio voava.
      // A poll GET started before the POST would land afterwards with the old
      // state — cancel it before writing the known outcome.
      await queryClient.cancelQueries({
        queryKey: studentBoardingStatusKey(currentTripId),
      })
      queryClient.setQueryData<StudentBoardingStatusResponse>(
        studentBoardingStatusKey(currentTripId),
        {
          tripId: currentTripId,
          status: 'NOT_RETURNING',
          absence: {
            id: absence.id,
            notifiedAt: absence.notifiedAt,
            cancellableUntil: absence.cancellableUntil,
          },
        },
      )
      void queryClient.invalidateQueries({
        queryKey: ['studentReminder', currentTripId],
      })
      attemptKeyRef.current = null
      setDialogVisible(false)
    },
    onError: (error, currentTripId) => {
      attemptKeyRef.current = null
      setDialogVisible(false)

      if (error instanceof ApiClientError && STATUS_RACE_CODES.has(error.code)) {
        void queryClient.invalidateQueries({
          queryKey: studentBoardingStatusKey(currentTripId),
        })
      }

      // The absence already exists on the server: for the student it is a
      // success — the refetched status shows the card with the real window.
      if (error instanceof ApiClientError && error.code === 'ALREADY_NOT_RETURNING') {
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
    onSuccess: async (_cancellation, currentTripId) => {
      // Sucesso = voltar ao ramo normal: "Não vou voltar" volta a ficar
      // disponível — o próprio ramo normal é o estado confirmado do
      // cancelamento. Same in-flight poll guard as the notify mutation.
      await queryClient.cancelQueries({
        queryKey: studentBoardingStatusKey(currentTripId),
      })
      queryClient.setQueryData<StudentBoardingStatusResponse>(
        studentBoardingStatusKey(currentTripId),
        { tripId: currentTripId, status: 'NOT_CHECKED_IN', absence: null },
      )
      // Cancelar reabre a pendência do lembrete no servidor.
      void queryClient.invalidateQueries({
        queryKey: ['studentReminder', currentTripId],
      })
      cancelAttemptKeyRef.current = null
    },
    onError: (error, currentTripId) => {
      cancelAttemptKeyRef.current = null

      // Window closed mid-flight (absence kept) or no absence to cancel: the
      // screen takes whatever the server says instead of guessing.
      if (error instanceof ApiClientError && STATUS_RACE_CODES.has(error.code)) {
        void queryClient.invalidateQueries({
          queryKey: studentBoardingStatusKey(currentTripId),
        })
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
  const absence = boardingStatus?.absence ?? null
  const expiryMs = absence ? Date.parse(absence.cancellableUntil) : null
  const isCounting = expiryMs !== null && nowMs < expiryMs

  React.useEffect(() => {
    if (!isCounting) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isCounting])

  const registered = boardingStatus?.status === 'NOT_RETURNING'
  const checkedIn = boardingStatus?.status === 'CHECKED_IN'
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

        {/* Acompanhamento em tempo real (Story 5.2): entrada ao lado do QR —
            a viagem (ida ou volta) é descoberta dentro da tela. */}
        <Button
          mode="contained-tonal"
          contentStyle={styles.buttonContent}
          icon="bus-clock"
          onPress={() => router.navigate('/(student)/track-bus')}
        >
          Acompanhar ônibus
        </Button>

        {/* Reminder (4.4) between the QR and the absence branch: it answers
            with the EXACT 4.1 mutation — the banner only opens the existing
            dialog. It disappears when the absence is registered or the GET
            returns null (pending state resolved). */}
        {pendingReminder && !registered && !checkedIn ? (
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

        {checkedIn ? (
          <Card mode="elevated" style={styles.absenceCard}>
            <Card.Content style={styles.absenceContent}>
              <Text variant="titleMedium">Embarque confirmado</Text>
              <Text variant="bodyMedium" style={styles.absenceHint}>
                O motorista registrou seu embarque na volta.
              </Text>
            </Card.Content>
          </Card>
        ) : registered ? (
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

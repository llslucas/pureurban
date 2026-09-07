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
  TRIP_NOT_ACTIVE: 'A viagem não está mais ativa. Atualize e tente de novo.',
  ALREADY_CHECKED_IN: 'Você já embarcou nesta viagem. Fale com o motorista.',
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
    onSuccess: (absence) => {
      queryClient.setQueryData<StudentAbsenceCache>(
        ['studentAbsence', tripId],
        { registered: true, absence },
      )
      attemptKeyRef.current = null
      setDialogVisible(false)
    },
    onError: (error: unknown) => {
      attemptKeyRef.current = null
      setDialogVisible(false)

      if (error instanceof ApiClientError && error.code === 'ALREADY_NOT_RETURNING') {
        // Reinstalação com cache >24h: a ausência existe no servidor, então
        // registrar de novo "falhou" — mas para o aluno é sucesso consolidado,
        // sem countdown (a janela de 2 min certamente expirou).
        queryClient.setQueryData<StudentAbsenceCache>(
          ['studentAbsence', tripId],
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

  const handleDismissDialog = () => {
    // Dialog abandonado encerra a tentativa: a próxima abre com chave nova.
    attemptKeyRef.current = null
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

      {registered ? (
        <Card mode="elevated" style={styles.absenceCard}>
          <Card.Content style={styles.absenceContent}>
            <Text variant="titleMedium">Ausência registrada</Text>
            <Text variant="bodyMedium" style={styles.absenceHint}>
              O motorista já foi avisado de que você não vai voltar.
            </Text>
            {windowExpired ? null : (
              <Text variant="titleMedium" style={styles.countdown}>
                Cancelar disponível por {formatCountdown((expiryMs ?? 0) - nowMs)}
              </Text>
            )}
          </Card.Content>
        </Card>
      ) : (
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

          <Button
            mode="contained-tonal"
            contentStyle={styles.buttonContent}
            icon="bus-alert"
            disabled={!tripId}
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
        </View>
      )}

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={handleDismissDialog}>
          <Dialog.Title>Não vou voltar?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              O motorista será avisado agora de que você não vai voltar no
              ônibus. Dá para cancelar nos primeiros 2 minutos.
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

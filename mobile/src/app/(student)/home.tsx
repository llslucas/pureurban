import * as Crypto from 'expo-crypto'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import React from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Snackbar, Text } from 'react-native-paper'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ShortcutCard } from '@/components/student-home/shortcut-card'
import { TripStatusCard, type TripStatusCardProps } from '@/components/student-home/trip-status-card'
import { Banner } from '@/components/ui/banner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CountdownPill } from '@/components/ui/countdown-pill'
import { PrimaryAction } from '@/components/ui/primary-action'
import { Screen } from '@/components/ui/screen'
import { StickyActionBar } from '@/components/ui/sticky-action-bar'
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
import { lightPalette } from '@/lib/palette'
import { spacing, typography } from '@/lib/tokens'
import { useAuthStore } from '@/stores/auth.store'

// While the home is open it must notice the driver starting the return and
// scanning the student. Paused in background by the focusManager (app-focus).
const HOME_POLL_MS = 15_000

// Outcomes that mean "the local state is behind the server". Each one already
// tells the student's state, written before the refetch so a failed refetch
// never leaves the screen stale. `absence: null` = consolidated, no countdown.
const RACE_OUTCOMES: Record<
  string,
  Pick<StudentBoardingStatusResponse, 'status' | 'absence'>
> = {
  ALREADY_NOT_RETURNING: { status: 'NOT_RETURNING', absence: null },
  CANCELLATION_PERIOD_EXPIRED: { status: 'NOT_RETURNING', absence: null },
  ABSENCE_NOT_FOUND: { status: 'NOT_CHECKED_IN', absence: null },
  ALREADY_CHECKED_IN: { status: 'CHECKED_IN', absence: null },
}

// Every typed contract error has a clear pt-BR message. ALREADY_NOT_RETURNING
// is not here: on this screen it is not an error, the status shows the absence.
const ERROR_MESSAGES: Record<string, string> = {
  STUDENT_NOT_ON_TRIP: 'Você não pertence à rota desta viagem.',
  TRIP_NOT_ACTIVE: 'A viagem não está mais ativa.',
  ALREADY_CHECKED_IN: 'Você já embarcou nesta viagem. Fale com o motorista.',
  CANCELLATION_PERIOD_EXPIRED:
    'O tempo para cancelar pelo app passou. Avise o motorista pessoalmente.',
  ABSENCE_NOT_FOUND: 'Não há registro de ausência para cancelar.',
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function StudentHomeScreen() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // Same cache entry as the driver (`activeTripOptions` factory): for a
  // student the API returns the active return trip on their route (or null).
  // Polling is this screen's only — the driver uses the factory without it.
  const { data: activeTrip, status: tripStatus } = useQuery({
    ...activeTripOptions(),
    refetchInterval: HOME_POLL_MS,
  })

  const tripId = activeTrip?.status === 'ACTIVE' ? activeTrip.id : null

  const applyRaceOutcome = async (error: unknown, raceTripId: string) => {
    if (!(error instanceof ApiClientError)) return
    const outcome = RACE_OUTCOMES[error.code]
    if (!outcome) return
    const key = studentBoardingStatusKey(raceTripId)
    await queryClient.cancelQueries({ queryKey: key })
    queryClient.setQueryData<StudentBoardingStatusResponse>(key, {
      tripId: raceTripId,
      ...outcome,
    })
    void queryClient.invalidateQueries({ queryKey: key })
  }

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
  // Key of the current attempt: generated on the first "Avisar motorista" tap
  // and kept until the outcome — a second tap mid-flight resends the SAME key,
  // and the server deduplicates (scan.tsx pattern).
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
      // Cache under the tripId the mutation received, not the render's: the
      // scope may have changed (trip ended/opened) while the request flew.
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
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      }
    },
    onError: async (error, currentTripId) => {
      attemptKeyRef.current = null
      setDialogVisible(false)

      await applyRaceOutcome(error, currentTripId)

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

  // Per-attempt key for the CANCELLATION, separate from the notify one: each
  // operation has its own replay on the server (the cancel key persists on the
  // voided row).
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
      // Success = back to the waiting state: "Não vou voltar" is available
      // again — that state confirms the cancellation. Same in-flight poll
      // guard as the notify mutation.
      await queryClient.cancelQueries({
        queryKey: studentBoardingStatusKey(currentTripId),
      })
      queryClient.setQueryData<StudentBoardingStatusResponse>(
        studentBoardingStatusKey(currentTripId),
        { tripId: currentTripId, status: 'NOT_CHECKED_IN', absence: null },
      )
      // Cancelling reopens the reminder's pending state on the server.
      void queryClient.invalidateQueries({
        queryKey: ['studentReminder', currentTripId],
      })
      cancelAttemptKeyRef.current = null
    },
    onError: async (error, currentTripId) => {
      cancelAttemptKeyRef.current = null

      // Window closed mid-flight (absence kept) or no absence to cancel.
      await applyRaceOutcome(error, currentTripId)

      setSnackbarMessage(
        error instanceof ApiClientError
          ? (ERROR_MESSAGES[error.code] ?? error.message)
          : 'Não foi possível cancelar a ausência. Tente novamente.',
      )
      setSnackbarVisible(true)
    },
  })

  // Local 1s tick derived from cancellableUntil — the client NEVER recomputes
  // the window, it only counts down to the server's value.
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

  // A poll can resolve the student's state while the dialog is open; confirming
  // then could only 409.
  React.useEffect(() => {
    if (checkedIn || registered) setDialogVisible(false)
  }, [checkedIn, registered])

  const handleConfirm = () => {
    if (!tripId) return
    notifyMutation.mutate(tripId)
  }

  // The tripId is captured on tap (mutation argument), not on render: the
  // scope may change while the cancellation flies (notifyMutation pattern).
  const handleCancel = () => {
    if (!tripId) return
    cancelMutation.mutate(tripId)
  }

  const handleDismissDialog = () => {
    // Defensive: ConfirmDialog already blocks dismissing while the request is
    // in flight. Should it ever get through, keeping the SAME key makes a
    // re-confirm resend what already left instead of registering twice.
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

  const statusCard: TripStatusCardProps = !tripId
    ? { stateKey: 'none', detail: tripHint }
    : checkedIn
      ? {
          stateKey: 'checked-in',
          chip: { status: 'CHECKED_IN' },
          title: 'Embarque confirmado',
          detail: 'O motorista registrou seu embarque na volta.',
          caption: activeTrip ? `Iniciada às ${formatTime(activeTrip.startedAt)}` : undefined,
        }
      : registered
        ? {
            stateKey: 'registered',
            chip: { status: 'NOT_RETURNING' },
            title: 'Motorista avisado',
            detail: 'Você não vai voltar nesta viagem.',
            caption: absence ? `Avisado às ${formatTime(absence.notifiedAt)}` : undefined,
          }
        : {
            stateKey: 'waiting',
            chip: { label: 'Aguardando', icon: 'clock-outline', tone: 'neutral' },
            title: 'Viagem de volta em andamento',
            caption: activeTrip ? `Iniciada às ${formatTime(activeTrip.startedAt)}` : undefined,
          }

  const footer =
    checkedIn || registered ? undefined : (
      <StickyActionBar>
        <PrimaryAction
          variant="secondary"
          label="Não vou voltar"
          icon="bus-alert"
          impact
          disabled={!tripId || notifyMutation.isPending}
          onPress={() => setDialogVisible(true)}
          testID="home-not-returning"
        />
      </StickyActionBar>
    )

  return (
    <View style={styles.root}>
      <Screen variant="scroll" footer={footer} testID="student-home">
        <View style={styles.content}>
          <Text style={styles.greeting} accessibilityRole="header">
            Olá, {user?.name ?? 'aluno'}
          </Text>

          {/* No action here: the footer is the single entry to the same dialog,
              so there are never two "Não vou voltar" buttons. */}
          {pendingReminder && !registered && !checkedIn ? (
            <Banner
              tone="warning"
              title="E a volta?"
              message="Você ainda não confirmou o retorno. Se não vai voltar, avise o motorista."
              testID="home-reminder"
            />
          ) : null}

          <TripStatusCard {...statusCard}>
            {registered && isCounting ? (
              <>
                <CountdownPill remainingMs={(expiryMs ?? 0) - nowMs} label="Desfazer em" />
                <PrimaryAction
                  variant="secondary"
                  label="Desfazer"
                  icon="undo-variant"
                  disabled={!tripId || cancelMutation.isPending}
                  loading={cancelMutation.isPending}
                  onPress={handleCancel}
                  testID="home-undo-absence"
                />
              </>
            ) : null}
          </TripStatusCard>

          <View style={styles.shortcuts}>
            {/* navigate, not push: two quick taps stacked two screens before the transition ended. */}
            <ShortcutCard
              label="Meu QR"
              icon="qrcode"
              onPress={() => router.navigate('/(student)/qr-code')}
              testID="home-qr-shortcut"
            />
            <ShortcutCard
              label="Onde está o ônibus"
              icon="bus-marker"
              onPress={() => router.navigate('/(student)/track-bus')}
              testID="home-track-shortcut"
            />
          </View>
        </View>
      </Screen>

      <ConfirmDialog
        visible={dialogVisible}
        title="Não vou voltar?"
        message="O motorista será avisado agora de que você não vai voltar no ônibus."
        confirmLabel="Avisar motorista"
        onConfirm={handleConfirm}
        onDismiss={handleDismissDialog}
        loading={notifyMutation.isPending}
        testID="home-not-returning-dialog"
      />

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
  root: {
    flex: 1,
    backgroundColor: lightPalette.surfaceSoft,
  },
  content: {
    gap: spacing.sectionGap,
  },
  greeting: {
    ...typography.titleLg,
    color: lightPalette.text,
  },
  shortcuts: {
    flexDirection: 'row',
    gap: spacing[3],
  },
})

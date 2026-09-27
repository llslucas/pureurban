import { router } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { Snackbar } from 'react-native-paper'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { RosterHeader } from '@/components/student-list/roster-header'
import { StudentRow } from '@/components/student-row'
import { Banner } from '@/components/ui/banner'
import { StudentListSkeleton } from '@/components/ui/screen-skeletons'
import { StateView } from '@/components/ui/state-view'
import { ApiClientError } from '@/services/api-client'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
import { spacing } from '@/lib/tokens'
import {
  connectBoardingEvents,
  type BoardingAbsenceCancelledEvent,
  type BoardingNotReturningEvent,
} from '@/services/boarding-events.service'
import { type TripStudents } from '@/services/trip.service'
import {
  activeTripOptions,
  tripStudentsKey,
  tripStudentsOptions,
} from '@/lib/trip-queries'
import { useAuthStore } from '@/stores/auth.store'

// Events land in the cache as a NEW array with a new object for the affected
// student only (StudentRow is React.memo: an in-place mutation would not
// re-render it, and fresh objects for everyone would re-render every row). The
// summary is adjusted in the cache and the query is always invalidated right
// after — the server is the truth (the total excluding absentees is its rule).
function applyNotReturningToRoster(
  roster: TripStudents,
  event: BoardingNotReturningEvent,
): TripStudents {
  const student = roster.students.find((s) => s.studentId === event.studentId)
  // Aluno já ausente: evento duplicado (replay pós-reconexão) — idempotente,
  // sem decrementar o total de novo.
  // Aluno já embarcado: o check-in prevalece (last-write-wins do épico) —
  // aplicar viraria badge e toast errados até o refetch; a invalidação feita
  // pelo handler reconcilia com o servidor.
  if (
    !student ||
    student.status === 'NOT_RETURNING' ||
    student.status === 'CHECKED_IN'
  ) {
    return roster
  }

  return {
    students: roster.students.map((s) =>
      s.studentId === event.studentId ? { ...s, status: 'NOT_RETURNING' } : s,
    ),
    // O total do servidor exclui o ausente (28/32 → 28/31); o boarded não muda
    // — quem avisou ausência não embarcou.
    summary: { ...roster.summary, total: Math.max(0, roster.summary.total - 1) },
  }
}

function applyAbsenceCancelledToRoster(
  roster: TripStudents,
  event: BoardingAbsenceCancelledEvent,
): TripStudents {
  const student = roster.students.find((s) => s.studentId === event.studentId)
  // Check-in prevalece sobre a ausência (last-write-wins do épico): se o
  // motorista já embarcou o aluno, o cache CHECKED_IN fica como está e a
  // invalidação abaixo reconcilia com o servidor.
  if (!student || student.status !== 'NOT_RETURNING') return roster

  return {
    students: roster.students.map((s) =>
      s.studentId === event.studentId ? { ...s, status: 'NOT_CHECKED_IN' } : s,
    ),
    // O aluno volta a contar no total ao reverter a ausência.
    summary: { ...roster.summary, total: roster.summary.total + 1 },
  }
}

export default function StudentListScreen() {
  const styles = useThemedStyles(createStyles)
  const { layers } = useAppTheme().custom
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' })
  // Stream SSE morto sem recuperação (refresh falhando em sequência — RV1):
  // a lista segue legível, mas sob o mesmo banner de dado velho do refetch
  // falho. Recuperação só com conexão nova (remount ou troca de viagem).
  const [streamStale, setStreamStale] = useState(false)

  const {
    data: activeTrip,
    status: tripStatus,
    refetch: refetchTrip,
  } = useQuery(activeTripOptions())

  const tripId = activeTrip?.id
  const roster = useQuery(tripStudentsOptions(tripId))

  // ---- Canal SSE (Story 4.2) ----

  // Evento com studentId fora do cache (roster velho, aluno novo na rota):
  // nada a aplicar localmente — só o refetch reconcilia com o servidor.
  const reconcileRoster = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: tripStudentsKey(tripId) })
  }, [queryClient, tripId])

  const handleNotReturning = useCallback(
    (event: BoardingNotReturningEvent) => {
      const rosterCache = queryClient.getQueryData<TripStudents>(tripStudentsKey(tripId))
      if (!rosterCache) {
        reconcileRoster()
        return
      }

      const student = rosterCache.students.find(
        (s) => s.studentId === event.studentId,
      )
      if (!student) {
        // Sem nome no cache não há toast — o nome nunca vem no evento (só IDs).
        reconcileRoster()
        return
      }

      const applied = applyNotReturningToRoster(rosterCache, event)
      if (applied !== rosterCache) {
        queryClient.setQueryData<TripStudents>(tripStudentsKey(tripId), applied)
        // Toast não bloqueante: o badge na lista é o sinal principal.
        setSnackbar({ visible: true, message: `${student.name} não vai voltar no ônibus` })
      }
      reconcileRoster()
    },
    [queryClient, tripId, reconcileRoster],
  )

  const handleAbsenceCancelled = useCallback(
    (event: BoardingAbsenceCancelledEvent) => {
      const rosterCache = queryClient.getQueryData<TripStudents>(tripStudentsKey(tripId))
      if (rosterCache) {
        const applied = applyAbsenceCancelledToRoster(rosterCache, event)
        if (applied !== rosterCache) {
          queryClient.setQueryData<TripStudents>(tripStudentsKey(tripId), applied)
        }
      }
      // Invalida mesmo sem mudança local: a verdade do servidor reconcilia
      // (inclusive o caso CHECKED_IN, onde o check-in prevalece).
      reconcileRoster()
    },
    [queryClient, tripId, reconcileRoster],
  )

  // Um cliente SSE por viagem ativa: trocou a viagem, fecha e reabre no canal
  // novo. close() no unmount e no 409 pós-fim de viagem (dentro do serviço).
  // onOpen reconcile por refetch: ausências acontecidas durante a queda de
  // rede chegam só no (re)estabelecimento da conexão.
  useEffect(() => {
    if (!tripId) return
    setStreamStale(false)
    const connection = connectBoardingEvents(tripId, {
      onNotReturning: handleNotReturning,
      onAbsenceCancelled: handleAbsenceCancelled,
      onOpen: reconcileRoster,
      onUnrecoverable: () => setStreamStale(true),
    })
    return () => connection.close()
  }, [tripId, handleNotReturning, handleAbsenceCancelled, reconcileRoster])

  // ---- Guardas na ordem da Tabela de Verdade ----

  // Estado 1 — guarda de role. `logout()` ANTES do replace: só navegar deixaria
  // `isAuthenticated` true e o shell montado atrás. (Rede de segurança — o shell
  // da 1.8 já redireciona um não-motorista para longe desta rota.)
  if (!user || user.role !== 'DRIVER') {
    return (
      <StateView
        kind="blocked"
        title="Acesso restrito"
        detail="Apenas motoristas veem a lista de embarque."
        action={{
          label: 'Entrar novamente',
          onPress: () => {
            logout()
            router.replace('/(auth)/login')
          },
        }}
      />
    )
  }

  // Estado 2 — `status === 'pending'`, nunca `isLoading`: com o cache do MMKV
  // reidratado ou a query pausada, `isLoading` mente.
  if (tripStatus === 'pending') {
    return <StudentListSkeleton label="Carregando viagem..." />
  }

  // Estado 3 — erro na viagem não é "sem viagem". Com o `networkMode: 'always'`
  // global, um refetch offline no meio da sessão chega a `error` COM a viagem em
  // cache: sem a condição `activeTrip === undefined` o bloqueio mascararia o
  // estado 7 (lista + Banner de dado velho assumem a partir daqui).
  if (tripStatus === 'error' && activeTrip === undefined) {
    return (
      <StateView
        kind="error"
        title="Não foi possível carregar a viagem"
        detail="Verifique sua conexão e tente novamente."
        action={{
          label: 'Tentar novamente',
          onPress: () => void refetchTrip(),
        }}
      />
    )
  }

  // Estado 4 — nenhuma viagem ativa. `GET /trips/active` devolve ACTIVE ou null;
  // COMPLETED não é alcançável a partir daqui (ver Tabela de Verdade).
  if (!activeTrip || activeTrip.status !== 'ACTIVE') {
    return (
      <StateView
        kind="blocked"
        icon="bus-clock"
        title="Nenhuma viagem ativa"
        detail="Inicie uma viagem para ver a lista de alunos."
        action={{
          label: 'Ir para Viagem',
          onPress: () => router.navigate('/(driver)/trip'),
        }}
      />
    )
  }

  // Estados 10, 11 e 12 — erro de negócio no roster, antes de qualquer coisa que
  // renderize a lista: mostrar um roster em cache sob um 403/404 seria enganoso.
  if (roster.isError && roster.error instanceof ApiClientError) {
    const { code } = roster.error

    // Estado 12 — o api-client já chamou logout() + replace('/(auth)/login')
    // antes de lançar. Pintar erro aqui desenharia sobre uma tela desmontando.
    if (code === 'UNAUTHORIZED') {
      return null
    }

    if (code === 'DRIVER_NOT_ASSIGNED') {
      return (
        <StateView
          kind="blocked"
          title="Viagem de outro motorista"
          detail="Você não é o responsável por esta viagem."
          action={{
            label: 'Ir para Viagem',
            onPress: () => router.navigate('/(driver)/trip'),
          }}
        />
      )
    }

    if (code === 'TRIP_NOT_FOUND') {
      return (
        <StateView
          kind="blocked"
          title="Viagem não encontrada"
          detail="Esta viagem não existe mais."
          action={{
            label: 'Ir para Viagem',
            onPress: () => router.navigate('/(driver)/trip'),
          }}
        />
      )
    }
  }

  // Estado 5 — roster carregando E sem dado em cache. Com `data` do MMKV já
  // presente, cai direto na lista (Tier 1) em vez de um skeleton por cima dele.
  if (roster.status === 'pending' && !roster.data) {
    return <StudentListSkeleton label="Carregando alunos..." />
  }

  // Estado 6 — erro sem cache: erro ≠ vazio.
  if (roster.isError && !roster.data) {
    return (
      <StateView
        kind="error"
        title="Não foi possível carregar a lista"
        detail="Verifique sua conexão e tente novamente."
        action={{
          label: 'Tentar novamente',
          onPress: () => void roster.refetch(),
        }}
      />
    )
  }

  // Defensivo — `enabled` é true aqui (viagem ACTIVE), então `data` deve existir.
  if (!roster.data) {
    return <StudentListSkeleton label="Carregando alunos..." />
  }

  const { students, summary } = roster.data
  // Estado 7 — erro COM cache: a lista continua legível, com indicador de dado
  // possivelmente velho. `isError && data` cobre tanto a falha de transporte
  // (offline) quanto um 500 do servidor; `streamStale` cobre o canal SSE morto
  // (stream sem reconexão, rede viva) — sem acoplar a tela ao store global.
  const showStaleBanner =
    (roster.isError && Boolean(roster.data)) || streamStale

  return (
    <View style={styles.container}>
      {/* Outside the FlatList so the count stays put while the list scrolls.
          Always from the server `summary`, never derived from `students` (FR25). */}
      <RosterHeader summary={summary} students={students} />

      {/* A persistent banner, not a Snackbar: the state lasts while there is no
          network or the stream is not reopened. Wording distinct from the
          OfflineBanner (write queue) — this screen is read-only (Tier 1), so
          promising a sync would be a lie. */}
      {showStaleBanner ? (
        <View style={styles.bannerSlot}>
          <Banner
            tone="warning"
            message="Dados podem estar desatualizados — sem atualização em tempo real"
            action={{ label: 'Atualizar', onPress: () => void roster.refetch() }}
            testID="stale-banner"
          />
        </View>
      ) : null}

      <FlatList
        data={students}
        keyExtractor={(s) => s.studentId}
        renderItem={({ item }) => <StudentRow student={item} testID={`student-row-${item.studentId}`} />}
        refreshControl={
          <RefreshControl
            {...layers.refresh}
            refreshing={roster.isFetching}
            onRefresh={() => {
              // Também a viagem: um `activeTrip` velho fica recuperável desta tela.
              void refetchTrip()
              void roster.refetch()
            }}
          />
        }
        ListEmptyComponent={
          <StateView
            kind="empty"
            icon="account-group-outline"
            title="Nenhum aluno vinculado a esta rota"
            testID="roster-empty"
          />
        }
        contentContainerStyle={students.length === 0 ? styles.listFill : undefined}
      />

      {/* Real-time absence toast — precedent: (student)/home.tsx. */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={4000}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  )
}

const createStyles = ({ custom: { palette } }: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.surfaceSoft,
    },
    bannerSlot: {
      paddingHorizontal: spacing.gutter,
      paddingTop: spacing[3],
    },
    listFill: {
      flexGrow: 1,
    },
  })

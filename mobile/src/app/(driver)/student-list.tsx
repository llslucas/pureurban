import { router } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Banner, Button, Snackbar, Text } from 'react-native-paper'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { StudentCard } from '@/components/student-card'
import { ApiClientError } from '@/services/api-client'
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
import { lightPalette } from '@/lib/palette'
import { useAuthStore } from '@/stores/auth.store'

// Eventos aplicados ao cache como NOVO array + novos objetos (StudentCard é
// React.memo: mutação in-place não re-renderizaria o card). O summary é
// ajustado no próprio cache e a query é sempre invalidada em seguida — o
// servidor é a verdade (o total que exclui ausentes é regra dele).
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
      <Centered
        title="Acesso restrito"
        detail="Apenas motoristas veem a lista de embarque."
        actionLabel="Entrar novamente"
        onAction={() => {
          logout()
          router.replace('/(auth)/login')
        }}
      />
    )
  }

  // Estado 2 — `status === 'pending'`, nunca `isLoading`: com o cache do MMKV
  // reidratado ou a query pausada, `isLoading` mente.
  if (tripStatus === 'pending') {
    return <Loading label="Carregando viagem..." />
  }

  // Estado 3 — erro na viagem não é "sem viagem". Com o `networkMode: 'always'`
  // global, um refetch offline no meio da sessão chega a `error` COM a viagem em
  // cache: sem a condição `activeTrip === undefined` o bloqueio mascararia o
  // estado 7 (lista + Banner de dado velho assumem a partir daqui).
  if (tripStatus === 'error' && activeTrip === undefined) {
    return (
      <Centered
        title="Não foi possível carregar a viagem"
        detail="Verifique sua conexão e tente novamente."
        actionLabel="Tentar novamente"
        onAction={() => void refetchTrip()}
      />
    )
  }

  // Estado 4 — nenhuma viagem ativa. `GET /trips/active` devolve ACTIVE ou null;
  // COMPLETED não é alcançável a partir daqui (ver Tabela de Verdade).
  if (!activeTrip || activeTrip.status !== 'ACTIVE') {
    return (
      <Centered
        title="Nenhuma viagem ativa"
        detail="Inicie uma viagem para ver a lista de alunos."
        actionLabel="Ir para Viagem"
        onAction={() => router.navigate('/(driver)/trip')}
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
        <Centered
          title="Viagem de outro motorista"
          detail="Você não é o responsável por esta viagem."
          actionLabel="Ir para Viagem"
          onAction={() => router.navigate('/(driver)/trip')}
        />
      )
    }

    if (code === 'TRIP_NOT_FOUND') {
      return (
        <Centered
          title="Viagem não encontrada"
          detail="Esta viagem não existe mais."
          actionLabel="Ir para Viagem"
          onAction={() => router.navigate('/(driver)/trip')}
        />
      )
    }
  }

  // Estado 5 — roster carregando E sem dado em cache. Com `data` do MMKV já
  // presente, cai direto na lista (Tier 1) em vez de um spinner por cima dele.
  if (roster.status === 'pending' && !roster.data) {
    return <Loading label="Carregando alunos..." />
  }

  // Estado 6 — erro sem cache: erro ≠ vazio.
  if (roster.isError && !roster.data) {
    return (
      <Centered
        title="Não foi possível carregar a lista"
        detail="Verifique sua conexão e tente novamente."
        actionLabel="Tentar novamente"
        onAction={() => void roster.refetch()}
      />
    )
  }

  // Defensivo — `enabled` é true aqui (viagem ACTIVE), então `data` deve existir.
  if (!roster.data) {
    return <Loading label="Carregando alunos..." />
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
      <View style={styles.header}>
        {/* Contagem SEMPRE de `summary` do servidor — nunca derivada de
            `students` (AC #2, FR25). */}
        <Text variant="titleLarge" style={styles.count}>
          {`${summary.boarded}/${summary.total} embarcados`}
        </Text>
      </View>

      {/* Banner persistente, não Snackbar: o estado dura enquanto não houver
          rede ou o stream não for reaberto. Texto distinto do OfflineBanner da
          3.4b (fila de escrita) — esta tela é leitura (Tier 1), prometer
          sincronização seria mentira. */}
      <Banner
        visible={showStaleBanner}
        actions={[{ label: 'Atualizar', onPress: () => void roster.refetch() }]}
      >
        Dados podem estar desatualizados — sem atualização em tempo real
      </Banner>

      <FlatList
        data={students}
        keyExtractor={(s) => s.studentId}
        renderItem={({ item }) => <StudentCard student={item} />}
        refreshControl={
          <RefreshControl
            refreshing={roster.isFetching}
            onRefresh={() => {
              // Também a viagem: um `activeTrip` velho fica recuperável desta tela.
              void refetchTrip()
              void roster.refetch()
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="titleMedium" style={styles.emptyTitle}>
              Nenhum aluno vinculado a esta rota
            </Text>
          </View>
        }
        contentContainerStyle={students.length === 0 ? styles.emptyContent : undefined}
      />

      {/* Toast de ausência em tempo real — precedente: (student)/home.tsx. */}
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

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" />
      <Text variant="bodyLarge" style={styles.centeredText}>
        {label}
      </Text>
    </View>
  )
}

function Centered({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string
  detail: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <View style={styles.centered}>
      <Text variant="titleLarge" style={styles.centeredTitle}>
        {title}
      </Text>
      <Text variant="bodyLarge" style={styles.centeredText}>
        {detail}
      </Text>
      <Button
        mode="contained"
        onPress={onAction}
        style={styles.action}
        contentStyle={styles.actionContent}
        labelStyle={styles.actionLabel}
      >
        {actionLabel}
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightPalette.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: lightPalette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightPalette.hairline,
  },
  count: {
    fontWeight: '700',
    color: lightPalette.text,
  },
  empty: {
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  emptyTitle: {
    color: lightPalette.textBody,
    textAlign: 'center',
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: lightPalette.background,
  },
  centeredTitle: {
    textAlign: 'center',
  },
  centeredText: {
    textAlign: 'center',
    opacity: 0.75,
  },
  action: {
    marginTop: 12,
    borderRadius: 12,
    alignSelf: 'stretch',
  },
  actionContent: {
    height: 56,
  },
  actionLabel: {
    fontSize: 18,
    fontWeight: 'bold',
  },
})

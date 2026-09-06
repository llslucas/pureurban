import { router } from 'expo-router'
import React from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Banner, Button, Text } from 'react-native-paper'
import { useQuery } from '@tanstack/react-query'

import { StudentCard } from '@/components/student-card'
import { ApiClientError } from '@/services/api-client'
import { tripService, type Trip } from '@/services/trip.service'
import { useAuthStore } from '@/stores/auth.store'

export default function StudentListScreen() {
  const { user, logout } = useAuthStore()

  // MESMA query key de trip.tsx e scan.tsx — reusar, não criar outra (finding de
  // review na 3.2b: key duplicada faz as telas divergirem). Mesmos parâmetros —
  // incluindo o `networkMode` default: se esta query errasse offline (estado 3),
  // a guarda `tripStatus === 'error'` renderizaria "Não foi possível carregar a
  // viagem" e **mascararia o estado 7**. Offline com viagem em cache, queremos
  // cair na lista + Banner de dado velho, não numa tela de bloqueio. Só o roster
  // ganha `networkMode: 'always'`.
  const {
    data: activeTrip,
    status: tripStatus,
    refetch: refetchTrip,
  } = useQuery<Trip | null>({
    queryKey: ['activeTrip'],
    queryFn: () => tripService.getActiveTrip(),
    staleTime: 10_000,
    retry: 2,
  })

  const tripId = activeTrip?.id
  const roster = useQuery({
    // Segmentada por viagem (ação #4 da retro do Épico 2): uma key sem `tripId`
    // faria a lista de uma viagem aparecer na seguinte, do cache reidratado.
    queryKey: ['trip', tripId, 'students'],
    queryFn: () => tripService.getTripStudents(tripId!),
    // Sem isto a queryFn roda com `tripId` undefined e o path vira
    // /api/v1/trips/undefined/students → 404.
    enabled: Boolean(tripId),
    staleTime: 15_000,
    // `networkMode: 'always'` é o que torna o estado 7 (AC #3 / FR24)
    // demonstrável no alvo web. Sem ele, o DevTools "Offline" dispara o evento
    // `offline` do window, o `onlineManager` padrão do TanStack fica offline, e
    // um refetch com o `networkMode: 'online'` default **pausa**
    // (`fetchStatus: 'paused'`) em vez de errar — `isError` nunca vira true e o
    // Banner de dado desatualizado nunca aparece. Com `'always'` o refetch
    // tenta mesmo "offline", falha no transporte, cai em `isError` mantendo o
    // `data` do cache, e o Banner aparece. Também alinha o comportamento ao
    // device nativo, onde o `onlineManager` nunca foi ligado ao NetInfo (defer
    // da 3.2b) e a query já não pausava. Escopo mínimo: só a query do roster —
    // a `['activeTrip']` fica com o default de propósito (ver comentário nela).
    networkMode: 'always',
    // Não retenta erro de negócio 4xx (403 DRIVER_NOT_ASSIGNED, 404
    // TRIP_NOT_FOUND — estados 10/11): a escada de backoff inteira antes da tela
    // de bloqueio seria ~3s de spinner à toa.
    retry: (count, error) =>
      count < 2 && !(error instanceof ApiClientError && error.status >= 400 && error.status < 500),
  })

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

  // Estado 3 — erro na viagem não é "sem viagem".
  if (tripStatus === 'error') {
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
  // (offline) quanto um 500 do servidor — sem acoplar a tela ao store global.
  const showStaleBanner = roster.isError && Boolean(roster.data)

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
          rede. Texto distinto do OfflineBanner da 3.4b (fila de escrita) — esta
          tela é leitura (Tier 1), prometer sincronização seria mentira. */}
      <Banner
        visible={showStaleBanner}
        actions={[{ label: 'Atualizar', onPress: () => void roster.refetch() }]}
      >
        Dados podem estar desatualizados — sem conexão com o servidor
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
    backgroundColor: '#F5F5F5',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  count: {
    fontWeight: '700',
    color: '#1A1A2E',
  },
  empty: {
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  emptyTitle: {
    color: '#555',
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
    backgroundColor: '#F5F5F5',
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

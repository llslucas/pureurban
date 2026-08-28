import React, { useCallback } from 'react'
import { router } from 'expo-router'
import { View, StyleSheet, ScrollView, Alert } from 'react-native'
import { Button, Card, Text, ActivityIndicator, Chip } from 'react-native-paper'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tripService } from '@/services/trip.service'
import type { Trip } from '@/services/trip.service'

// Placeholder: substituir pelo ID de rota real do motorista quando Epic 2 estiver pronto
const PLACEHOLDER_ROUTE_ID = 'route-placeholder-id'

function TripStatusChip({ status }: { status: 'ACTIVE' | 'COMPLETED' }) {
  return (
    <Chip
      mode="flat"
      style={[styles.statusChip, status === 'ACTIVE' ? styles.chipActive : styles.chipCompleted]}
      textStyle={styles.chipText}
    >
      {status === 'ACTIVE' ? '🟢 Em Andamento' : '✅ Concluída'}
    </Chip>
  )
}

function TripTypeLabel({ type }: { type: 'OUTBOUND' | 'RETURN' }) {
  return (
    <Text style={styles.tripTypeLabel}>
      {type === 'OUTBOUND' ? '🚌 Viagem de Ida' : '🔄 Viagem de Retorno'}
    </Text>
  )
}

export default function TripScreen() {
  const queryClient = useQueryClient()

  const { data: activeTrip, isLoading: isLoadingTrip } = useQuery<Trip | null>({
    queryKey: ['activeTrip'],
    queryFn: () => tripService.getActiveTrip(),
    staleTime: 10_000,
    retry: 2,
  })

  const startMutation = useMutation({
    mutationFn: ({ type, relatedTripId }: { type: 'OUTBOUND' | 'RETURN'; relatedTripId?: string }) =>
      tripService.startTrip(PLACEHOLDER_ROUTE_ID, type, relatedTripId),
    onSuccess: (trip) => {
      queryClient.setQueryData(['activeTrip'], trip)
    },
    onError: (error: Error) => {
      Alert.alert('Erro', error.message ?? 'Não foi possível iniciar a viagem')
    },
  })

  const endMutation = useMutation({
    mutationFn: (tripId: string) => tripService.endTrip(tripId),
    onSuccess: (completedTrip) => {
      queryClient.setQueryData(['activeTrip'], completedTrip)
    },
    onError: (error: Error) => {
      Alert.alert('Erro', error.message ?? 'Não foi possível encerrar a viagem')
    },
  })

  const handleStartOutbound = useCallback(() => {
    startMutation.mutate({ type: 'OUTBOUND' })
  }, [startMutation])

  const handleStartReturn = useCallback(() => {
    if (activeTrip) {
      startMutation.mutate({ type: 'RETURN', relatedTripId: activeTrip.id })
    }
  }, [startMutation, activeTrip])

  const handleEnd = useCallback(() => {
    if (activeTrip) {
      endMutation.mutate(activeTrip.id)
    }
  }, [endMutation, activeTrip])

  if (isLoadingTrip) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Carregando viagem...</Text>
      </View>
    )
  }

  const isMutating = startMutation.isPending || endMutation.isPending

  // Estado 1: Sem viagem ativa ou viagem concluída (pode iniciar OUTBOUND)
  if (!activeTrip || activeTrip.status === 'COMPLETED') {
    const isReturn = activeTrip?.status === 'COMPLETED' && activeTrip.type === 'OUTBOUND'
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Gestão de Viagem</Text>
        {activeTrip && activeTrip.status === 'COMPLETED' && (
          <Card style={styles.card}>
            <Card.Content>
              <TripTypeLabel type={activeTrip.type} />
              <TripStatusChip status={activeTrip.status} />
              <Text style={styles.infoText}>Rota: {activeTrip.routeId}</Text>
              <Text style={styles.infoText}>Alunos: 0/0 (em breve)</Text>
            </Card.Content>
          </Card>
        )}
        {isReturn ? (
          <Button
            mode="contained"
            onPress={handleStartReturn}
            loading={isMutating}
            disabled={isMutating}
            style={styles.primaryButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            icon="replay"
          >
            Iniciar Retorno
          </Button>
        ) : (
          <Button
            mode="contained"
            onPress={handleStartOutbound}
            loading={isMutating}
            disabled={isMutating}
            style={styles.primaryButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            icon="bus"
          >
            Iniciar Viagem
          </Button>
        )}
      </ScrollView>
    )
  }

  // Estado 2/4: Viagem ACTIVE (OUTBOUND ou RETURN)
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Gestão de Viagem</Text>
      <Card style={styles.card}>
        <Card.Content>
          <TripTypeLabel type={activeTrip.type} />
          <TripStatusChip status={activeTrip.status} />
          <Text style={styles.infoText}>Rota: {activeTrip.routeId}</Text>
          <Text style={styles.infoText}>Alunos: 0/0 (em breve)</Text>
          <Text style={styles.infoText}>
            Início: {new Date(activeTrip.startedAt).toLocaleTimeString('pt-BR')}
          </Text>
        </Card.Content>
      </Card>
      {/* Contagem de toques da NFR19: o login leva o motorista direto a esta
          tela (0 toques) → 1 toque aqui → câmera aberta.
          `navigate`, não `push`: dois toques rápidos empilhavam duas telas, e
          cada uma abriria sua própria câmera. */}
      <Button
        mode="contained"
        onPress={() => router.navigate('/(driver)/scan')}
        disabled={isMutating}
        style={styles.primaryButton}
        contentStyle={styles.buttonContent}
        labelStyle={styles.buttonLabel}
        icon="qrcode-scan"
      >
        Escanear QR Code
      </Button>
      <Button
        mode="contained"
        onPress={handleEnd}
        loading={isMutating}
        disabled={isMutating}
        style={[styles.primaryButton, styles.endButton]}
        contentStyle={styles.buttonContent}
        labelStyle={styles.buttonLabel}
        icon="stop-circle"
        buttonColor="#D32F2F"
      >
        Encerrar Viagem
      </Button>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 40,
    backgroundColor: '#F5F5F5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    marginTop: 8,
    color: '#666',
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A2E',
    marginBottom: 24,
  },
  card: {
    borderRadius: 12,
    marginBottom: 24,
    elevation: 2,
    backgroundColor: '#FFFFFF',
  },
  statusChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 12,
  },
  chipActive: {
    backgroundColor: '#E8F5E9',
  },
  chipCompleted: {
    backgroundColor: '#E3F2FD',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tripTypeLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 15,
    color: '#555',
    marginTop: 6,
  },
  // NFR18: botões grandes, mínimo 48dp, operação com uma mão
  primaryButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  endButton: {
    marginTop: 16,
  },
  buttonContent: {
    height: 56,
    paddingHorizontal: 8,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
})

import React from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, SegmentedButtons, Text } from 'react-native-paper'

import { lightPalette } from '@/lib/palette'
import type { AssignedRoute } from '@/services/routes.service'

interface StartOutboundSectionProps {
  routes: AssignedRoute[] | undefined
  isPending: boolean
  isError: boolean
  isFetching: boolean
  onRetry: () => void
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  resolvedRouteId: string | null
  isMutating: boolean
  onStart: () => void
}

// "Iniciar Viagem" area when there is no active trip. The routeId comes from
// GET /routes/mine (Epic 2): one route -> auto-selected; two or more -> selector
// before the button; none -> button disabled with guidance. A network error is
// never rendered as "no route" -- distinct message and retry, like
// (driver)/routes.tsx.
export function StartOutboundSection({
  routes,
  isPending,
  isError,
  isFetching,
  onRetry,
  selectedRouteId,
  onSelectRoute,
  resolvedRouteId,
  isMutating,
  onStart,
}: StartOutboundSectionProps) {
  const noRoutes = !routes || routes.length === 0

  // Hold the loading indicator until the routes query has actually resolved
  // once: while it is still pending (or disabled) `noRoutes` is true only
  // because there is no data yet, so the "no routes" empty state must not show.
  if (isPending || (isFetching && noRoutes && !isError)) {
    return (
      <View style={styles.routesLoading}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Carregando rotas...</Text>
      </View>
    )
  }

  if (isError && noRoutes) {
    return (
      <View style={styles.routesMessage}>
        <Text style={styles.routesErrorText}>Não foi possível carregar suas rotas.</Text>
        <Text style={styles.routesHint}>Verifique sua conexão e tente novamente.</Text>
        <Button
          mode="contained"
          onPress={onRetry}
          loading={isFetching}
          style={styles.primaryButton}
          contentStyle={styles.buttonContent}
          labelStyle={styles.buttonLabel}
        >
          Tentar novamente
        </Button>
      </View>
    )
  }

  if (noRoutes) {
    return (
      <View style={styles.routesMessage}>
        <Text style={styles.routesHint}>Peça ao administrador para vincular uma rota.</Text>
        <Button
          mode="contained"
          disabled
          style={styles.primaryButton}
          contentStyle={styles.buttonContent}
          labelStyle={styles.buttonLabel}
          icon="bus"
        >
          Iniciar Viagem
        </Button>
      </View>
    )
  }

  return (
    <>
      {routes.length > 1 && (
        <View style={styles.selectorBlock}>
          <Text style={styles.selectorLabel}>Escolha a rota da viagem</Text>
          <SegmentedButtons
            value={selectedRouteId ?? ''}
            onValueChange={onSelectRoute}
            buttons={routes.map((route) => ({ value: route.id, label: route.name }))}
          />
        </View>
      )}
      <Button
        mode="contained"
        onPress={onStart}
        loading={isMutating}
        disabled={isMutating || !resolvedRouteId}
        style={styles.primaryButton}
        contentStyle={styles.buttonContent}
        labelStyle={styles.buttonLabel}
        icon="bus"
      >
        Iniciar Viagem
      </Button>
    </>
  )
}

const styles = StyleSheet.create({
  loadingText: {
    marginTop: 8,
    color: lightPalette.textMuted,
    fontSize: 16,
  },
  routesLoading: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  routesMessage: {
    gap: 8,
    marginBottom: 8,
  },
  routesErrorText: {
    fontSize: 16,
    color: lightPalette.textBody,
    fontWeight: '600',
  },
  routesHint: {
    fontSize: 14,
    color: lightPalette.textMuted,
    lineHeight: 20,
  },
  selectorBlock: {
    marginBottom: 16,
    gap: 8,
  },
  selectorLabel: {
    fontSize: 15,
    color: lightPalette.textBody,
    fontWeight: '600',
  },
  // NFR18: botões grandes, mínimo 48dp, operação com uma mão
  primaryButton: {
    borderRadius: 12,
    marginTop: 8,
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

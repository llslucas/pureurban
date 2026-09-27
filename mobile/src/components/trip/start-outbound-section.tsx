import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { MdiIcon } from '@/components/ui/mdi-icon'
import { RouteSelectorSkeleton } from '@/components/ui/screen-skeletons'
import { StateView } from '@/components/ui/state-view'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
import { radius, spacing, typography } from '@/lib/tokens'
import type { AssignedRoute } from '@/services/routes.service'

export type StartOutboundPhase = 'loading' | 'error' | 'no-routes' | 'ready'

interface RoutesQueryState {
  routes: AssignedRoute[] | undefined
  isPending: boolean
  isError: boolean
  isFetching: boolean
}

// The screen reads the same phase to decide whether "Iniciar Viagem" goes in
// the action bar: only when there is a route to start on.
export function startOutboundPhase({ routes, isPending, isError, isFetching }: RoutesQueryState): StartOutboundPhase {
  const noRoutes = !routes || routes.length === 0
  // While the query is pending (or disabled) `noRoutes` is true only because
  // there is no data yet, so the "no routes" state must not show.
  if (isPending || (isFetching && noRoutes && !isError)) return 'loading'
  // A network error is never rendered as "no route".
  if (isError && noRoutes) return 'error'
  if (noRoutes) return 'no-routes'
  return 'ready'
}

interface StartOutboundSectionProps {
  phase: StartOutboundPhase
  routes: AssignedRoute[] | undefined
  isFetching: boolean
  onRetry: () => void
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  disabled: boolean
}

// Content of the no-trip state; the "Iniciar Viagem" action lives in the
// screen's StickyActionBar. One route is auto-selected; two or more need a pick.
export function StartOutboundSection({
  phase,
  routes,
  isFetching,
  onRetry,
  selectedRouteId,
  onSelectRoute,
  disabled,
}: StartOutboundSectionProps) {
  const { palette } = useAppTheme().custom
  const styles = useThemedStyles(createStyles)
  if (phase === 'loading') {
    return <RouteSelectorSkeleton label="Carregando rotas..." testID="start-outbound-state" />
  }

  if (phase === 'error') {
    return (
      <StateView
        kind="error"
        title="Não foi possível carregar suas rotas."
        detail="Verifique sua conexão e tente novamente."
        action={{ label: 'Tentar novamente', onPress: onRetry, icon: 'refresh', loading: isFetching }}
        testID="start-outbound-state"
      />
    )
  }

  if (phase === 'no-routes' || !routes) {
    return (
      <StateView
        kind="empty"
        icon="map-marker-off"
        title="Você ainda não tem rota"
        detail="Peça ao administrador para vincular uma rota."
        testID="start-outbound-state"
      />
    )
  }

  const single = routes.length === 1

  return (
    <View style={styles.root}>
      <StateView
        kind="empty"
        icon="bus-clock"
        title="Nenhuma viagem em andamento"
        detail={single ? routes[0].name : undefined}
        testID="start-outbound-state"
      />
      {single ? null : (
        <View style={styles.selector} accessibilityRole="radiogroup">
          <Text style={styles.selectorLabel}>Escolha a rota da viagem</Text>
          <View style={styles.list}>
            {routes.map((route, index) => {
              const checked = route.id === selectedRouteId
              return (
                <Pressable
                  key={route.id}
                  onPress={() => onSelectRoute(route.id)}
                  disabled={disabled}
                  accessibilityRole="radio"
                  accessibilityState={{ checked, disabled }}
                  accessibilityLabel={route.name}
                  style={[styles.option, index > 0 && styles.divider]}
                  testID={`route-option-${route.id}`}
                >
                  <MdiIcon
                    name={checked ? 'radiobox-marked' : 'radiobox-blank'}
                    size={24}
                    color={checked ? palette.primary : palette.textMuted}
                  />
                  <Text style={styles.optionLabel}>{route.name}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}

const createStyles = ({ custom: { palette, elevation } }: AppTheme) =>
  StyleSheet.create({
    root: {
      flexGrow: 1,
      gap: spacing.sectionGap,
    },
    selector: {
      gap: spacing[2],
    },
    selectorLabel: {
      ...typography.label,
      color: palette.textBody,
    },
    list: {
      ...elevation.level1,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: spacing.actionHeight,
      paddingHorizontal: spacing[4],
      gap: spacing[3],
    },
    divider: {
      borderTopWidth: 1,
      borderTopColor: palette.hairline,
    },
    optionLabel: {
      ...typography.bodyLg,
      color: palette.text,
      flexShrink: 1,
    },
  })

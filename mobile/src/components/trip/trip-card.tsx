import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { BoardingCounter, type BoardingSummary } from '@/components/ui/boarding-counter'
import { StatusChip } from '@/components/ui/status-chip'
import { type AppTheme, useThemedStyles } from '@/lib/theme'
import { radius, spacing, typography } from '@/lib/tokens'
import type { TripType } from '@/services/trip.service'

export interface TripCardProps {
  type: TripType
  status: 'ACTIVE' | 'COMPLETED'
  /** Never the route UUID: the caller falls back to "Rota atribuída". */
  routeName: string
  summary: BoardingSummary | undefined
  startedAt: string
  testID?: string
}

const TYPE_LABEL: Record<TripType, string> = {
  OUTBOUND: 'Viagem de ida',
  RETURN: 'Viagem de retorno',
}

export function formatStartTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function TripCard({ type, status, routeName, summary, startedAt, testID = 'trip-card' }: TripCardProps) {
  const styles = useThemedStyles(createStyles)
  const isActive = status === 'ACTIVE'

  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.overline}>{TYPE_LABEL[type]}</Text>
      <View style={styles.header}>
        <Text style={styles.routeName} accessibilityRole="header">
          {routeName}
        </Text>
        {isActive ? (
          <StatusChip label="Em andamento" icon="progress-clock" tone="success" testID={`${testID}-status`} />
        ) : (
          <StatusChip label="Concluída" icon="flag-checkered" tone="info" testID={`${testID}-status`} />
        )}
      </View>
      {summary && summary.total === 0 ? (
        <Text style={styles.body}>Nenhum aluno nesta rota</Text>
      ) : (
        <BoardingCounter summary={summary} />
      )}
      {isActive ? <Text style={styles.body}>Iniciada às {formatStartTime(startedAt)}</Text> : null}
    </View>
  )
}

const createStyles = ({ custom: { palette, elevation } }: AppTheme) =>
  StyleSheet.create({
    card: {
      ...elevation.level1,
      borderRadius: radius.lg,
      padding: spacing[4],
      gap: spacing[3],
    },
    overline: {
      ...typography.overline,
      color: palette.textMuted,
      textTransform: 'uppercase',
    },
    // Wraps so a large font scale drops the chip below the name instead of truncating.
    header: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing[2],
    },
    routeName: {
      ...typography.titleLg,
      color: palette.text,
      flexShrink: 1,
    },
    body: {
      ...typography.bodyLg,
      color: palette.textBody,
    },
  })

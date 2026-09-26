import React from 'react'
import { StyleSheet } from 'react-native'
import { Chip, Text } from 'react-native-paper'

import { lightPalette, statusTints } from '@/lib/palette'

export function TripStatusChip({ status }: { status: 'ACTIVE' | 'COMPLETED' }) {
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

export function TripTypeLabel({ type }: { type: 'OUTBOUND' | 'RETURN' }) {
  return (
    <Text style={styles.tripTypeLabel}>
      {type === 'OUTBOUND' ? '🚌 Viagem de Ida' : '🔄 Viagem de Retorno'}
    </Text>
  )
}

const styles = StyleSheet.create({
  statusChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 12,
  },
  chipActive: {
    backgroundColor: statusTints.success,
  },
  chipCompleted: {
    backgroundColor: statusTints.info,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tripTypeLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: lightPalette.textBody,
    marginBottom: 4,
  },
})

import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { STATUS_PRESENTATION } from '@/lib/boarding-status'
import { lightPalette } from '@/lib/palette'
import type { TripStudentItem } from '@/services/trip.service'

// Re-exported: the palette guard probes import the map from here.
export { STATUS_PRESENTATION }

function formatCheckedInAt(iso: string): string {
  // Architecture §6: ISO 8601 UTC na API, conversão para o timezone local só
  // aqui. Mesmo padrão de trip.tsx. Uma data não-parseável (contrato antigo no
  // cache, lixo do servidor) não pode virar "Invalid Date" na cara do motorista.
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function StudentCardComponent({ student }: { student: TripStudentItem }) {
  // Fallback: um `status` de contrato antigo reidratado do MMKV, ou um status
  // futuro do Épico 4, não pode derrubar a FlatList inteira acessando
  // `.background`/`.color` de `undefined`.
  const presentation = STATUS_PRESENTATION[student.status] ?? STATUS_PRESENTATION.NOT_CHECKED_IN

  const time =
    student.status === 'CHECKED_IN' && student.checkedInAt
      ? formatCheckedInAt(student.checkedInAt)
      : ''

  // Anúncio único para o leitor de tela — sem isto o card é lido como fragmentos
  // soltos (nome, horário, chip). Mesmo padrão de `offline-banner.tsx`.
  const accessibilityLabel = time
    ? `${student.name}, ${presentation.label} às ${time}`
    : `${student.name}, ${presentation.label}`

  return (
    <View style={styles.card} accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.info}>
        <Text variant="titleMedium" numberOfLines={1} ellipsizeMode="tail" style={styles.name}>
          {student.name}
        </Text>
        {time ? (
          <Text variant="bodyMedium" style={styles.time}>
            {time}
          </Text>
        ) : null}
      </View>
      <View style={[styles.chip, { backgroundColor: presentation.background }]}>
        <Text variant="labelLarge" style={[styles.chipLabel, { color: presentation.color }]}>
          {presentation.icon} {presentation.label}
        </Text>
      </View>
    </View>
  )
}

// O item é re-renderizado pela FlatList a cada invalidação do roster (Task 2.8).
export const StudentCard = React.memo(StudentCardComponent)

const styles = StyleSheet.create({
  // Altura mínima e padding relativo, nunca largura fixa em px: medida absoluta
  // estourou em devices <= 368dp na review da 3.2b (Task 2.6).
  card: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightPalette.hairline,
    backgroundColor: lightPalette.surface,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '600',
    color: lightPalette.text,
  },
  time: {
    color: lightPalette.textBody,
  },
  // Um nome longo não pode empurrar o status para fora da tela (Task 2.7).
  chip: {
    flexShrink: 0,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipLabel: {
    fontWeight: '700',
  },
})

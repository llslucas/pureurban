import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import type { OfflineSyncState } from '@/hooks/use-offline-sync'

// Banner GLOBAL, um por app (Story 3.4b). Badge por item e contador de teto na
// UI foram cortados para a Fase 2 em 28/08/2026 — o motorista dirigindo precisa
// de um sinal, não de um inventário.
const PENDING_COLOR = '#37474F'
const FAILED_COLOR = '#B3261E'

function pendingLabel(count: number): string {
  // O texto da NFR13 é literal e não varia com a contagem; o número entra como
  // sufixo para o motorista saber se a fila está andando.
  const suffix = count === 1 ? '1 embarque na fila' : `${count} embarques na fila`
  return `Modo Offline — dados serão sincronizados (${suffix})`
}

function failedLabel(count: number): string {
  return count === 1
    ? '1 embarque não pôde ser enviado. Registre manualmente.'
    : `${count} embarques não puderam ser enviados. Registre manualmente.`
}

interface OfflineBannerProps extends OfflineSyncState {
  /** Inset inferior da safe area; o banner é a última coisa na tela. */
  insetBottom?: number
}

export function OfflineBanner({ pendingCount, failedCount, insetBottom = 0 }: OfflineBannerProps) {
  // Nada pendente e nada falhado: o banner some por inteiro, inclusive o
  // preenchimento da safe area — senão deixaria uma faixa vazia no rodapé.
  if (pendingCount === 0 && failedCount === 0) return null

  return (
    <View
      style={[styles.container, { paddingBottom: insetBottom }]}
      // O banner aparece e some sozinho: sem isto o leitor de tela nunca anuncia
      // nem a fila crescendo nem o embarque que exige registro manual (NFR18).
      // `accessible` agrupa as faixas num anúncio só, em vez de duas paradas de
      // foco no rodapé de todas as telas do motorista.
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      {failedCount > 0 ? (
        // Falha definitiva vem primeiro: é a única das duas que exige ação do
        // motorista, e as tentativas já se esgotaram.
        <View style={[styles.strip, { backgroundColor: FAILED_COLOR }]}>
          <Text variant="titleMedium" style={styles.text}>
            {failedLabel(failedCount)}
          </Text>
        </View>
      ) : null}
      {pendingCount > 0 ? (
        <View style={[styles.strip, { backgroundColor: PENDING_COLOR }]}>
          <Text variant="titleMedium" style={styles.text}>
            {pendingLabel(pendingCount)}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // Ocupa espaço no fluxo em vez de sobrepor: como overlay, cobriria os botões
  // do overlay de resultado da tela de scan, que ficam na metade inferior.
  container: {
    alignSelf: 'stretch',
  },
  strip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  // NFR18: alto contraste e >= 16sp, legível em movimento e sob sol direto.
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
})

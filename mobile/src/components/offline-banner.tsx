import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Text } from 'react-native-paper'

import { lightPalette } from '@/lib/palette'
import type { OfflineSyncState } from '@/hooks/use-offline-sync'

// Banner GLOBAL, um por app (Story 3.4b). Badge por item e contador de teto na
// UI foram cortados para a Fase 2 em 28/08/2026 — o motorista dirigindo precisa
// de um sinal, não de um inventário. Cores = papéis da paleta (`@/lib/palette`):
// pendente na família ink/body (era o slate do template), falha no vermelho único.
const PENDING_COLOR = lightPalette.textBody
const FAILED_COLOR = lightPalette.error

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
  /**
   * D1/AC6: reconhecimento explícito — sem ele o vermelho fica preso para
   * sempre, porque `failedCount` de item definitivo nunca volta a zero sozinho.
   */
  onDismissFailed?: () => void
}

export function OfflineBanner({
  pendingCount,
  failedCount,
  insetBottom = 0,
  onDismissFailed,
}: OfflineBannerProps) {
  // Nada pendente e nada falhado: o banner some por inteiro, inclusive o
  // preenchimento da safe area — senão deixaria uma faixa vazia no rodapé.
  if (pendingCount === 0 && failedCount === 0) return null

  return (
    <View
      style={[styles.container, { paddingBottom: insetBottom }]}
      // O banner aparece e some sozinho: o liveRegion anuncia as faixas no
      // Android; o papel `alert` vive nos TEXTS (auto-acessíveis) e não no
      // container porque `accessible` aqui achataria a subárvore num único
      // elemento e tornaria o botão "Dispensar" inalcançável no VoiceOver.
      accessibilityLiveRegion="polite"
    >
      {failedCount > 0 ? (
        // Falha definitiva vem primeiro: é a única das duas que exige ação do
        // motorista, e as tentativas já se esgotaram.
        <View style={[styles.strip, { backgroundColor: FAILED_COLOR }]}>
          <Text variant="titleMedium" style={styles.text} accessibilityRole="alert">
            {failedLabel(failedCount)}
          </Text>
          {onDismissFailed ? (
            // "Dispensar" reconhece a falha (as linhas failed são apagadas) — é
            // o desfecho do D1: o vermelho não é prisão perpétua.
            <Button
              mode="contained-tonal"
              compact
              onPress={onDismissFailed}
              style={styles.dismissButton}
              labelStyle={styles.dismissLabel}
              testID="offline-banner-dismiss"
            >
              Dispensar
            </Button>
          ) : null}
        </View>
      ) : null}
      {pendingCount > 0 ? (
        <View style={[styles.strip, { backgroundColor: PENDING_COLOR }]}>
          <Text variant="titleMedium" style={styles.text} accessibilityRole="alert">
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
    // room para o botão de dispensar sem esconder o texto.
    gap: 4,
  },
  // NFR18: alto contraste e >= 16sp, legível em movimento e sob sol direto.
  text: {
    color: lightPalette.onPrimary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  dismissButton: {
    alignSelf: 'center',
    // Sobre o vermelho do strip: tonal herda a cor do tema; forçar contraste.
    // Branco 92% (allowlist da guarda de paleta): overlay funcional sobre a
    // faixa de falha, não papel do tema.
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  dismissLabel: {
    color: FAILED_COLOR,
    fontWeight: '700',
  },
})

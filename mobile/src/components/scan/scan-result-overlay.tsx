import { router } from 'expo-router'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Text } from 'react-native-paper'

import { lightPalette } from '@/lib/palette'
import { feedbackIcon, type Tone } from '@/utils/scan-feedback'

// Union discriminado em vez de booleanos soltos (architecture.md §6). Com
// booleanos, `isChecking && isError` é representável e significa nada.
export type ScanResult =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'success'; title: string; detail: string }
  | {
      kind: 'failure'
      // Campos de `ScanFeedback` (`@/utils/scan-feedback`), achatados no union
      // para o render discriminar por `kind` sem desembrulhar um nível a mais.
      code: string
      tone: Tone
      title: string
      detail: string
      canRetry: boolean
    }

const TONE_COLOR: Record<Tone, string> = {
  // Verde/âmbar/vermelho/tinta (família ink/body para offline) sobre o preto da
  // câmera — contraste alto, legível em movimento e sob sol direto (NFR18).
  // Papéis da paleta única (`@/lib/palette`); o branco dos overlays é `onPrimary`.
  success: lightPalette.success,
  warn: lightPalette.warning,
  error: lightPalette.error,
  offline: lightPalette.textBody,
}

interface ScanResultOverlayProps {
  result: ScanResult
  onResume: () => void
  onRetry: () => void
}

export function ScanResultOverlay({ result, onResume, onRetry }: ScanResultOverlayProps) {
  // Quando existe uma ação primária branca no overlay (retry ou "Ir para
  // Viagem"), "Escanear próximo" vira secundária — dois botões brancos
  // contained empilhados não teriam hierarquia nenhuma.
  const hasPrimaryAction =
    result.kind === 'failure' && (result.canRetry || result.code === 'TRIP_NOT_ACTIVE')

  return result.kind === 'checking' ? (
    <View style={[styles.overlay, { backgroundColor: lightPalette.primary }]}>
      <View style={styles.overlayMessage}>
        <ActivityIndicator size="large" color={lightPalette.onPrimary} />
        <Text variant="headlineSmall" style={styles.overlayTitle}>
          Verificando...
        </Text>
      </View>
    </View>
  ) : result.kind === 'success' ? (
    <View style={[styles.overlay, { backgroundColor: TONE_COLOR.success }]}>
      <View style={styles.overlayMessage}>
        <Text style={styles.icon}>✓</Text>
        <Text variant="headlineSmall" style={styles.overlayTitle}>
          {result.title}
        </Text>
        <Text variant="titleMedium" style={styles.overlayDetail}>
          {result.detail}
        </Text>
      </View>
      <View style={styles.overlayActions}>
        <Button
          mode="contained"
          buttonColor={lightPalette.onPrimary}
          textColor={TONE_COLOR.success}
          onPress={onResume}
          style={styles.action}
          contentStyle={styles.actionContent}
          labelStyle={styles.actionLabel}
        >
          Escanear próximo
        </Button>
      </View>
    </View>
  ) : result.kind === 'failure' ? (
    <View style={[styles.overlay, { backgroundColor: TONE_COLOR[result.tone] }]}>
      <View style={styles.overlayMessage}>
        <Text style={styles.icon}>{feedbackIcon(result)}</Text>
        <Text variant="headlineSmall" style={styles.overlayTitle}>
          {result.title}
        </Text>
        <Text variant="titleMedium" style={styles.overlayDetail}>
          {result.detail}
        </Text>
      </View>
      <View style={styles.overlayActions}>
        {result.canRetry ? (
          <Button
            mode="contained"
            buttonColor={lightPalette.onPrimary}
            textColor={TONE_COLOR[result.tone]}
            onPress={onRetry}
            style={styles.action}
            contentStyle={styles.actionContent}
            labelStyle={styles.actionLabel}
          >
            Tentar novamente
          </Button>
        ) : null}
        {/* Estado 12 é a única linha da Tabela de Verdade que pede esta
            afordância: sem ela o motorista lê "Inicie uma viagem antes de
            registrar embarques" sem nenhum caminho até lá. */}
        {result.code === 'TRIP_NOT_ACTIVE' ? (
          <Button
            mode="contained"
            buttonColor={lightPalette.onPrimary}
            textColor={TONE_COLOR[result.tone]}
            onPress={() => router.navigate('/(driver)/trip')}
            style={styles.action}
            contentStyle={styles.actionContent}
            labelStyle={styles.actionLabel}
          >
            Ir para Viagem
          </Button>
        ) : null}
        {/* Cores explícitas: `outlined`/`contained-tonal` derivam do tema e
            ficam ilegíveis sobre vermelho ou âmbar. */}
        <Button
          mode={hasPrimaryAction ? 'text' : 'contained'}
          buttonColor={hasPrimaryAction ? undefined : lightPalette.onPrimary}
          textColor={hasPrimaryAction ? lightPalette.onPrimary : TONE_COLOR[result.tone]}
          onPress={onResume}
          style={styles.action}
          contentStyle={styles.actionContent}
          labelStyle={styles.actionLabel}
        >
          Escanear próximo
        </Button>
      </View>
    </View>
  ) : null
}

const styles = StyleSheet.create({
  // Overlay de resultado cobrindo a tela inteira: em movimento, o motorista não
  // tem tempo de procurar um snackbar no rodapé (NFR18).
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 24,
  },
  // Mensagem ocupa o espaço livre e fica centrada; as ações são empurradas para
  // a metade inferior. Com tudo numa pilha `justifyContent: 'center'`, os botões
  // caíam no meio da tela, fora do alcance do polegar de quem segura o aparelho
  // com uma mão só (NFR18 / Task 7.10).
  overlayMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  overlayActions: {
    alignSelf: 'stretch',
    gap: 12,
    paddingBottom: 32,
  },
  icon: {
    fontSize: 72,
    lineHeight: 80,
    color: lightPalette.onPrimary,
    fontWeight: 'bold',
  },
  overlayTitle: {
    color: lightPalette.onPrimary,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // NFR18 / Task 7.10: >= 18sp e em negrito. `titleMedium` do MD3 resolve para
  // 16sp com peso 500, e a opacidade reduzida piorava ainda mais a leitura em
  // movimento — é esta linha que carrega o "por quê" do resultado.
  overlayDetail: {
    color: lightPalette.onPrimary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // NFR18: alvo de toque de 56dp, alinhado ao precedente de `(driver)/trip.tsx`.
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

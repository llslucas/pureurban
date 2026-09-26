import React, { useEffect, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { Text } from 'react-native-paper'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { lightPalette, withAlpha } from '@/lib/palette'
import { spacing, typography } from '@/lib/tokens'

interface ScanFrameProps {
  /** A result is on screen: the sweep stops. */
  isPaused: boolean
}

// Proporção da menor dimensão da tela ocupada pela janela de escaneamento.
// Proporção, não pixel fixo: uma medida absoluta estoura em devices ≤ 368dp
// (iPhone SE e toda a classe 360dp de Android) — foi finding de review na 3.2b.
const WINDOW_RATIO = 0.7
const CORNER = 36
const CORNER_WIDTH = 5
const LINE_HEIGHT = 2
// One way; `withRepeat` reverses it, so a full down-and-up pass is 1.8s.
const SWEEP_MS = 900

function Corner({ style }: { style: object }) {
  return <View style={[styles.corner, style]} />
}

function ScanLine({ travel }: { travel: number }) {
  const offset = useSharedValue(0)

  useEffect(() => {
    offset.value = 0
    offset.value = withRepeat(
      withTiming(travel, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    )
    return () => cancelAnimation(offset)
  }, [offset, travel])

  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))

  return <Animated.View style={[styles.line, lineStyle]} testID="scan-frame-line" />
}

/**
 * Máscara escura com a janela recortada: dá ao motorista um alvo óbvio para
 * onde apontar, em vez de uma imagem de câmera sem referência (AC #1). Quatro
 * painéis explícitos em vez do truque de `borderWidth: 9999` — o truque zera o
 * raio interno e se comporta diferente entre iOS e Android; quatro Views são
 * previsíveis nos dois.
 */
export function ScanFrame({ isPaused }: ScanFrameProps) {
  const { width, height } = useWindowDimensions()
  const reducedMotion = useReducedMotion()
  const windowSize = Math.min(width, height) * WINDOW_RATIO
  // The line only starts once the window is laid out, so it never sweeps a
  // stale size after a rotation or a resize on web.
  const [measured, setMeasured] = useState(0)
  const sweeping = !isPaused && !reducedMotion && measured > 0

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="scan-frame">
      <View style={styles.maskPanel} />
      <View style={styles.maskMiddleRow}>
        <View style={styles.maskPanel} />
        <View
          style={[styles.window, { width: windowSize, height: windowSize }]}
          onLayout={(event) => setMeasured(event.nativeEvent.layout.height)}
        >
          {sweeping ? <ScanLine travel={measured - LINE_HEIGHT} /> : null}
          <Corner style={styles.topLeft} />
          <Corner style={styles.topRight} />
          <Corner style={styles.bottomLeft} />
          <Corner style={styles.bottomRight} />
        </View>
        <View style={styles.maskPanel} />
      </View>
      <View style={styles.maskPanel}>
        <Text style={styles.hint}>Aponte para o QR do aluno</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Allowlist da guarda de paleta: máscara escura ao redor da janela — chrome
  // de câmera, não cor de UI.
  maskPanel: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  maskMiddleRow: {
    flexDirection: 'row',
    // SEM `alignItems: 'center'`: com `center`, os dois painéis que ladeiam a
    // janela não têm altura própria (só `flex: 1`, que aqui governa a largura)
    // e calculam 0dp — as laterais da faixa central ficavam sem escurecer, e a
    // "moldura" virava uma fenda horizontal de ponta a ponta. O `stretch`
    // padrão faz os painéis acompanharem a altura da janela.
    justifyContent: 'center',
  },
  window: {
    // Sem fundo: é o recorte por onde a câmera aparece.
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  line: {
    position: 'absolute',
    top: 0,
    left: spacing[2],
    right: spacing[2],
    height: LINE_HEIGHT,
    backgroundColor: withAlpha(lightPalette.onPrimary, 0.6),
  },
  // Cantos brancos sobre a máscara escura: contraste máximo, legível sob sol
  // direto e com o ônibus em movimento (NFR18).
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: lightPalette.onPrimary,
  },
  topLeft: {
    top: -CORNER_WIDTH,
    left: -CORNER_WIDTH,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: 20,
  },
  topRight: {
    top: -CORNER_WIDTH,
    right: -CORNER_WIDTH,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: 20,
  },
  bottomLeft: {
    bottom: -CORNER_WIDTH,
    left: -CORNER_WIDTH,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: 20,
  },
  bottomRight: {
    bottom: -CORNER_WIDTH,
    right: -CORNER_WIDTH,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: 20,
  },
  hint: {
    ...typography.bodyLg,
    color: lightPalette.onPrimary,
    textAlign: 'center',
    marginTop: spacing[5],
    paddingHorizontal: spacing.gutter,
  },
})

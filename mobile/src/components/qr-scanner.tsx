import { CameraView, type BarcodeScanningResult } from 'expo-camera'
import React, { useCallback } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'

interface QrScannerProps {
  /** Recebe a string bruta do QR. Quem interpreta o conteúdo é a tela. */
  onScan: (raw: string) => void
  /** Enquanto true, nenhuma leitura é reportada. Ver comentário do gate abaixo. */
  isPaused: boolean
}

// Proporção da menor dimensão da tela ocupada pela janela de escaneamento.
// Proporção, não pixel fixo: uma medida absoluta estoura em devices ≤ 368dp
// (iPhone SE e toda a classe 360dp de Android) — foi finding de review na 3.2b.
const WINDOW_RATIO = 0.7
const CORNER = 36
const CORNER_WIDTH = 5

function Corner({ style }: { style: object }) {
  return <View style={[styles.corner, style]} />
}

/**
 * Captura pura: abre a câmera, desenha a janela de leitura e devolve a string
 * do QR. Não conhece check-in, não faz rede, não conhece códigos de erro —
 * quem traduz o conteúdo é `(driver)/scan.tsx`.
 *
 * Assume permissão já concedida: a decisão de pedir/negar permissão é da tela.
 */
export function QrScanner({ onScan, isPaused }: QrScannerProps) {
  const { width, height } = useWindowDimensions()
  const windowSize = Math.min(width, height) * WINDOW_RATIO

  const handleScan = useCallback(
    (result: BarcodeScanningResult) => {
      onScan(result.data)
    },
    [onScan],
  )

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        // Restrito a 'qr': sem isso o código de barras de uma mochila ou de um
        // livro dispara uma tentativa de check-in que só pode falhar.
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        // GATE: `onBarcodeScanned` é chamado repetidamente enquanto o código
        // estiver no enquadramento — dezenas de vezes por segundo, com
        // frequência variando por device (expo/expo#9619). Passar `undefined` é
        // o mecanismo suportado pela lib para desligar a leitura.
        //
        // Um `if (isPaused) return` DENTRO do callback não substitui isto: o
        // callback continuaria sendo invocado a cada frame. E sem gate nenhum,
        // um único QR vira uma rajada de POSTs — o primeiro devolve 201 e todos
        // os seguintes 409 DUPLICATE_CHECK_IN, pintando de vermelho um embarque
        // que deu certo.
        onBarcodeScanned={isPaused ? undefined : handleScan}
      />

      {/* Máscara escura com a janela recortada: dá ao motorista um alvo óbvio
          para onde apontar, em vez de uma imagem de câmera sem referência (AC #1).
          Quatro painéis explícitos em vez do truque de `borderWidth: 9999` —
          o truque zera o raio interno e se comporta diferente entre iOS e
          Android; quatro Views são previsíveis nos dois. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.maskPanel} />
        <View style={styles.maskMiddleRow}>
          <View style={styles.maskPanel} />
          <View style={[styles.window, { width: windowSize, height: windowSize }]}>
            <Corner style={styles.topLeft} />
            <Corner style={styles.topRight} />
            <Corner style={styles.bottomLeft} />
            <Corner style={styles.bottomRight} />
          </View>
          <View style={styles.maskPanel} />
        </View>
        <View style={styles.maskPanel} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  maskPanel: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  maskMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  window: {
    // Sem fundo: é o recorte por onde a câmera aparece.
    backgroundColor: 'transparent',
  },
  // Cantos brancos sobre a máscara escura: contraste máximo, legível sob sol
  // direto e com o ônibus em movimento (NFR18).
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: '#FFFFFF',
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
})

import { CameraView, type BarcodeScanningResult } from 'expo-camera'
import React, { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'

import { ScanFrame } from '@/components/scan/scan-frame'

interface QrScannerProps {
  /** Recebe a string bruta do QR. Quem interpreta o conteúdo é a tela. */
  onScan: (raw: string) => void
  /** Enquanto true, nenhuma leitura é reportada. Ver comentário do gate abaixo. */
  isPaused: boolean
  /** A câmera não pôde ser montada. Quem decide o que mostrar é a tela. */
  onMountError: (message: string) => void
}

/**
 * Captura pura: abre a câmera, desenha a janela de leitura e devolve a string
 * do QR. Não conhece check-in, não faz rede, não conhece códigos de erro —
 * quem traduz o conteúdo é `(driver)/scan.tsx`.
 *
 * Assume permissão já concedida: a decisão de pedir/negar permissão é da tela.
 */
export function QrScanner({ onScan, isPaused, onMountError }: QrScannerProps) {
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
        // frequência variando por device (issue 9619 do expo/expo). Passar `undefined` é
        // o mecanismo suportado pela lib para desligar a leitura.
        //
        // Um `if (isPaused) return` DENTRO do callback não substitui isto: o
        // callback continuaria sendo invocado a cada frame. E sem gate nenhum,
        // um único QR vira uma rajada de POSTs — o primeiro devolve 201 e todos
        // os seguintes 409 DUPLICATE_CHECK_IN, pintando de vermelho um embarque
        // que deu certo.
        onBarcodeScanned={isPaused ? undefined : handleScan}
        // Sem isto, uma câmera que falha ao montar (hardware ocupado, emulador
        // sem câmera, erro de driver) deixa a tela preta com a moldura para
        // sempre: `onBarcodeScanned` nunca dispara e nada explica o que houve.
        onMountError={(event) => onMountError(event.message)}
      />

      <ScanFrame isPaused={isPaused} />
    </View>
  )
}

const styles = StyleSheet.create({
  // Allowlist da guarda de paleta: fundo do viewfinder — chrome de câmera, não
  // cor de UI.
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
})

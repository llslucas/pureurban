import React from 'react'
import { useWindowDimensions, View, StyleSheet } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

interface StudentQrCodeProps {
  value: string
  size?: number
}

// Chrome horizontal que o consumidor reserva ao redor do QR: 24px de padding do
// ScrollView + 16px de padding do Card.Content, de cada lado. Reservar menos que
// isso faz o card estourar a largura da tela em qualquer device <= 368dp
// (iPhone SE, e toda a classe 360dp de Android) e o ScrollView não rola na
// horizontal — a borda do card some cortada.
const HORIZONTAL_CHROME = (24 + 16) * 2
const MAX_SIZE = 288
const MIN_SIZE = 120

export function StudentQrCode({ value, size }: StudentQrCodeProps) {
  const { width } = useWindowDimensions()
  const resolvedSize = size ?? Math.max(MIN_SIZE, Math.min(width - HORIZONTAL_CHROME, MAX_SIZE))

  return (
    <View style={styles.wrapper}>
      {/* Allowlist da guarda de paleta: quiet zone branca PURA e módulos pretos
          puros são requisito óptico de leitura do QR (borda de silêncio), não
          cores de UI — trocá-las quebraria o scan. */}
      <QRCode
        value={value}
        size={resolvedSize}
        backgroundColor="#FFFFFF"
        color="#000000"
        quietZone={16}
        ecl="M"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // Fundo branco puro do wrapper: continuação da quiet zone do QR (allowlist).
  wrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignSelf: 'center',
  },
})

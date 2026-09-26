import React from 'react'
import { useWindowDimensions, View, StyleSheet } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import { elevation, spacing } from '@/lib/tokens'

interface StudentQrCodeProps {
  value: string
  size?: number
}

// Horizontal chrome the QR pass reserves around the code, per side: Screen
// gutter + pass border + pass body padding. These must match QrPass's layout
// (its body padding is spacing[4]). Reserving less makes the pass wider than
// narrow screens (iPhone SE, the 320–360dp Android class); the ScrollView does
// not scroll horizontally, so the card edge gets clipped.
const HORIZONTAL_CHROME = (spacing.gutter + elevation.level1.borderWidth + spacing[4]) * 2
const MAX_SIZE = 288
const MIN_SIZE = 120

export function StudentQrCode({ value, size }: StudentQrCodeProps) {
  const { width } = useWindowDimensions()
  const resolvedSize = size ?? Math.max(MIN_SIZE, Math.min(width - HORIZONTAL_CHROME, MAX_SIZE))

  return (
    <View style={styles.wrapper}>
      {/* Palette-guard allowlist: pure white quiet zone and pure black modules
          are an optical requirement for reading the QR, not UI colors. */}
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
  // Pure white continues the QR quiet zone (allowlisted).
  wrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignSelf: 'center',
  },
})

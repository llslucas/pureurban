import React from 'react'

import { PrimaryAction } from '@/components/ui/primary-action'
import { StickyActionBar } from '@/components/ui/sticky-action-bar'
import { useAppTheme } from '@/lib/theme'

interface ActiveTripActionsProps {
  onEnd: () => void
  onScan: () => void
  disabled: boolean
}

// "Encerrar" is secondary in red, above the primary and away from the thumb:
// it's irreversible and used to sit 16px from "Escanear" (D-UX-7).
export function ActiveTripActions({ onEnd, onScan, disabled }: ActiveTripActionsProps) {
  const { palette } = useAppTheme().custom
  return (
    <StickyActionBar>
      <PrimaryAction
        variant="secondary"
        color={palette.error}
        icon="stop-circle"
        label="Encerrar Viagem"
        onPress={onEnd}
        disabled={disabled}
        testID="end-trip-action"
      />
      <PrimaryAction
        icon="qrcode-scan"
        label="Escanear QR Code"
        onPress={onScan}
        disabled={disabled}
        testID="scan-action"
      />
    </StickyActionBar>
  )
}

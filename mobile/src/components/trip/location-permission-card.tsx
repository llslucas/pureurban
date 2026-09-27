import React, { useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import type { LocationPermissionResponse } from 'expo-location'

import { MdiIcon } from '@/components/ui/mdi-icon'
import { PrimaryAction } from '@/components/ui/primary-action'
import { lightPalette } from '@/lib/palette'
import { elevation, radius, spacing, typography } from '@/lib/tokens'

interface LocationPermissionCardProps {
  permission: Pick<LocationPermissionResponse, 'canAskAgain'>
  requestPermission: () => Promise<unknown>
  description?: string
}

const DRIVER_DESCRIPTION =
  'O PureUrban usa sua localização para transmitir a posição do ônibus aos alunos enquanto a ' +
  'viagem está em andamento. Nada é coletado fora da viagem ativa.'

const ICON_SIZE = 40

// For the driver, GPS capture is automatic, so this card is the ONLY way in to
// grant location — shown before the first trip and during a trip without
// permission. Permanently denied: opening the system settings is the only way out.
export function LocationPermissionCard({
  permission,
  requestPermission,
  description = DRIVER_DESCRIPTION,
}: LocationPermissionCardProps) {
  const [actionError, setActionError] = useState<string | null>(null)

  const handlePress = permission.canAskAgain
    ? () => {
        setActionError(null)
        requestPermission().catch(() =>
          setActionError(
            'Não foi possível pedir a permissão. Libere a localização nas configurações do sistema.',
          ),
        )
      }
    : () => {
        setActionError(null)
        Linking.openSettings().catch(() =>
          setActionError(
            'Não foi possível abrir as configurações. Abra manualmente e libere a localização para o PureUrban.',
          ),
        )
      }

  return (
    <View style={styles.card} testID="location-permission-card">
      <MdiIcon name="map-marker-radius" size={ICON_SIZE} color={lightPalette.text} />
      <Text style={styles.title} accessibilityRole="header">
        Permissão de localização
      </Text>
      <Text style={styles.body}>{description}</Text>
      {/* Secondary: during a trip the bar's "Escanear" stays the only contained action. */}
      <PrimaryAction
        variant="secondary"
        label={permission.canAskAgain ? 'Permitir acesso à localização' : 'Abrir configurações'}
        icon={permission.canAskAgain ? 'map-marker-radius' : 'cog'}
        onPress={handlePress}
        testID="location-permission-action"
      />
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    ...elevation.level1,
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[3],
  },
  title: {
    ...typography.title,
    color: lightPalette.text,
  },
  body: {
    ...typography.bodyLg,
    color: lightPalette.textBody,
  },
  error: {
    ...typography.bodyLg,
    color: lightPalette.error,
  },
})

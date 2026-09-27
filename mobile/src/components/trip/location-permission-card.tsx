import React, { useState } from 'react'
import { Linking } from 'react-native'
import type { LocationPermissionResponse } from 'expo-location'

import { PermissionCard } from '@/components/ui/permission-card'

interface LocationPermissionCardProps {
  permission: Pick<LocationPermissionResponse, 'canAskAgain'>
  requestPermission: () => Promise<unknown>
  description?: string
}

const DRIVER_DESCRIPTION =
  'O PureUrban usa sua localização para transmitir a posição do ônibus aos alunos enquanto a ' +
  'viagem está em andamento. Nada é coletado fora da viagem ativa.'

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

  // Secondary: during a trip the bar's "Escanear" stays the only contained action.
  return (
    <PermissionCard
      icon="map-marker-radius"
      title="Permissão de localização"
      description={description}
      actionLabel={permission.canAskAgain ? 'Permitir acesso à localização' : 'Abrir configurações'}
      actionIcon={permission.canAskAgain ? 'map-marker-radius' : 'cog'}
      onPress={handlePress}
      variant="secondary"
      note={actionError}
      testID="location-permission-card"
      actionTestID="location-permission-action"
    />
  )
}

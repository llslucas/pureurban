import { router } from 'expo-router'
import React, { useState } from 'react'
import { Linking } from 'react-native'

import { StateView } from '@/components/ui/state-view'

// Role guard: a student who lands on this route must not scan anyone.
export function RoleGuardState({ logout }: { logout: () => void }) {
  return (
    <StateView
      kind="blocked"
      title="Acesso restrito"
      detail="Apenas motoristas podem registrar embarques."
      action={{
        label: 'Entrar novamente',
        onPress: () => {
          // `logout()` BEFORE the replace, as in `(student)/qr-code.tsx`
          // (Task 7.11). Navigating alone would leave `isAuthenticated` true: the
          // student would sit on a login form with a live session, and the
          // shell would stay mounted behind it.
          logout()
          router.replace('/(auth)/login')
        },
      }}
    />
  )
}

interface CameraPermissionStateProps {
  canAskAgain: boolean
  requestPermission: () => Promise<unknown>
}

// Truth Table state 2. One component for both branches, so `actionError`
// survives the switch from "ask" to "blocked".
export function CameraPermissionState({ canAskAgain, requestPermission }: CameraPermissionStateProps) {
  // Failure to open the permission prompt or the system settings. Both promises
  // used to be discarded with `void`: the rejection went unhandled and the
  // button just looked dead.
  const [actionError, setActionError] = useState<string | null>(null)

  return canAskAgain ? (
    <StateView
      kind="blocked"
      icon="camera"
      title="Permissão da câmera"
      detail="O PureUrban precisa da câmera para ler o QR code dos alunos."
      note={actionError}
      action={{
        label: 'Permitir acesso à câmera',
        onPress: () => {
          setActionError(null)
          requestPermission().catch(() =>
            setActionError(
              'Não foi possível pedir a permissão. Libere a câmera nas configurações do sistema.',
            ),
          )
        },
      }}
    />
  ) : (
    <StateView
      kind="blocked"
      icon="camera-off"
      title="Câmera bloqueada"
      detail="A permissão foi negada. Libere o acesso à câmera nas configurações do sistema."
      note={actionError}
      action={{
        label: 'Abrir configurações',
        onPress: () => {
          setActionError(null)
          Linking.openSettings().catch(() =>
            setActionError(
              'Não foi possível abrir as configurações. Abra manualmente e libere a câmera para o PureUrban.',
            ),
          )
        },
      }}
    />
  )
}

// Truth Table state 4.
export function NoActiveTripState() {
  return (
    <StateView
      kind="blocked"
      icon="bus-clock"
      title="Nenhuma viagem ativa"
      detail="Inicie uma viagem para começar a registrar embarques."
      action={{
        label: 'Ir para Viagem',
        onPress: () => router.navigate('/(driver)/trip'),
      }}
    />
  )
}

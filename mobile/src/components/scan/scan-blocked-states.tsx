import { router } from 'expo-router'
import React, { useState } from 'react'
import { Linking } from 'react-native'

import { StateView } from '@/components/ui/state-view'

// Guarda de role: um aluno que chegue nesta rota não pode escanear ninguém.
export function RoleGuardState({ logout }: { logout: () => void }) {
  return (
    <StateView
      kind="blocked"
      title="Acesso restrito"
      detail="Apenas motoristas podem registrar embarques."
      action={{
        label: 'Entrar novamente',
        onPress: () => {
          // `logout()` ANTES do replace, como em `(student)/qr-code.tsx`
          // (Task 7.11). Só navegar deixaria `isAuthenticated` true: o aluno
          // ficaria estacionado num formulário de login com a sessão viva, e o
          // shell continuaria montado atrás.
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

// Estado 2 da Tabela de Verdade. Um único componente para os dois ramos: o
// `actionError` sobrevive à troca de "pedir" para "bloqueada".
export function CameraPermissionState({ canAskAgain, requestPermission }: CameraPermissionStateProps) {
  // Falha ao abrir o pedido de permissão ou as configurações do sistema. Antes
  // as duas promises eram descartadas com `void`: a rejeição ficava sem
  // tratamento e o botão simplesmente parecia morto.
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

// Estado 4.
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

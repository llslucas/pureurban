import { router } from 'expo-router'
import React, { useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'

import { PermissionCard } from '@/components/ui/permission-card'
import { StateView } from '@/components/ui/state-view'
import { type AppTheme, useThemedStyles } from '@/lib/theme'
import { spacing } from '@/lib/tokens'

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
  const styles = useThemedStyles(createStyles)
  // Failure to open the permission prompt or the system settings. Both promises
  // used to be discarded with `void`: the rejection went unhandled and the
  // button just looked dead.
  const [actionError, setActionError] = useState<string | null>(null)

  const onPress = canAskAgain
    ? () => {
        setActionError(null)
        requestPermission().catch(() =>
          setActionError(
            'Não foi possível pedir a permissão. Libere a câmera nas configurações do sistema.',
          ),
        )
      }
    : () => {
        setActionError(null)
        Linking.openSettings().catch(() =>
          setActionError(
            'Não foi possível abrir as configurações. Abra manualmente e libere a câmera para o PureUrban.',
          ),
        )
      }

  return (
    <View style={styles.permissionScreen}>
      <PermissionCard
        icon={canAskAgain ? 'camera' : 'camera-off'}
        title={canAskAgain ? 'Permissão da câmera' : 'Câmera bloqueada'}
        description={
          canAskAgain
            ? 'O PureUrban precisa da câmera para ler o QR code dos alunos.'
            : 'A permissão foi negada. Libere o acesso à câmera nas configurações do sistema.'
        }
        actionLabel={canAskAgain ? 'Permitir acesso à câmera' : 'Abrir configurações'}
        actionIcon={canAskAgain ? 'camera' : 'cog'}
        onPress={onPress}
        note={actionError}
        style={styles.permissionCard}
        testID="camera-permission-card"
        actionTestID="camera-permission-action"
      />
    </View>
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

const createStyles = ({ custom: { palette } }: AppTheme) =>
  StyleSheet.create({
    permissionScreen: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.gutter,
      backgroundColor: palette.surfaceSoft,
    },
    permissionCard: {
      width: '100%',
      maxWidth: spacing.contentMaxWidth,
    },
  })

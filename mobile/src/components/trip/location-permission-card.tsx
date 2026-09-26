import React, { useState } from 'react'
import { Linking, StyleSheet } from 'react-native'
import { Button, Card, Text } from 'react-native-paper'
import type { LocationPermissionResponse } from 'expo-location'

import { lightPalette } from '@/lib/palette'

interface LocationPermissionCardProps {
  permission: LocationPermissionResponse
  requestPermission: () => Promise<LocationPermissionResponse>
}

// Card de justificativa da permissão de localização (padrão scan.tsx): a
// captura de GPS é automática, então este card é a ÚNICA porta de entrada do
// motorista para autorizar — visível no estado inicial e durante a viagem sem
// permissão. Negado permanente: abrir configurações é a única saída.
export function LocationPermissionCard({ permission, requestPermission }: LocationPermissionCardProps) {
  const [actionError, setActionError] = useState<string | null>(null)

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.permissionTitle}>Permissão de localização</Text>
        <Text style={styles.permissionText}>
          O PureUrban usa sua localização para transmitir a posição do ônibus aos
          alunos enquanto a viagem está em andamento. Nada é coletado fora da
          viagem ativa.
        </Text>
        {permission.canAskAgain ? (
          <Button
            mode="contained"
            onPress={() => {
              setActionError(null)
              requestPermission().catch(() =>
                setActionError(
                  'Não foi possível pedir a permissão. Libere a localização nas configurações do sistema.',
                ),
              )
            }}
            style={styles.primaryButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            icon="map-marker-radius"
          >
            Permitir acesso à localização
          </Button>
        ) : (
          <Button
            mode="contained"
            onPress={() => {
              setActionError(null)
              Linking.openSettings().catch(() =>
                setActionError(
                  'Não foi possível abrir as configurações. Abra manualmente e libere a localização para o PureUrban.',
                ),
              )
            }}
            style={styles.primaryButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            icon="cog"
          >
            Abrir configurações
          </Button>
        )}
        {actionError && <Text style={styles.permissionError}>{actionError}</Text>}
      </Card.Content>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 24,
    elevation: 2,
    backgroundColor: lightPalette.surface,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: lightPalette.textBody,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 15,
    color: lightPalette.textBody,
    lineHeight: 22,
    marginBottom: 12,
  },
  permissionError: {
    fontSize: 13,
    color: lightPalette.error,
    marginTop: 8,
  },
  primaryButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  buttonContent: {
    height: 56,
    paddingHorizontal: 8,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
})

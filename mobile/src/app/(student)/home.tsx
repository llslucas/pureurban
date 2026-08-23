import { router } from 'expo-router'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Text } from 'react-native-paper'

import { useAuthStore } from '@/stores/auth.store'

export default function StudentHomeScreen() {
  const { user } = useAuthStore()

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.greeting}>
        Olá, {user?.name ?? 'aluno'}
      </Text>

      {/* Contagem de toques da AC #5: login leva a home (0 toques) → 1 toque aqui → QR na tela. */}
      <Button
        mode="contained"
        contentStyle={styles.buttonContent}
        // navigate, não push: dois toques rápidos empilhavam duas telas de QR
        // (duas queries, dois backs) antes da transição terminar.
        onPress={() => router.navigate('/(student)/qr-code')}
      >
        Meu QR Code
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  greeting: {
    textAlign: 'center',
  },
  buttonContent: {
    paddingVertical: 10,
  },
})

import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text, Button } from 'react-native-paper'
import { useAuthStore } from '@/stores/auth.store'

export default function AdminHome() {
  const { logout } = useAuthStore()

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>
        Painel Administrativo
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Área reservada para administradores.
      </Text>
      <Button mode="outlined" onPress={logout} style={styles.button}>
        Sair
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  title: {
    textAlign: 'center',
    fontWeight: 'bold',
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
  button: {
    marginTop: 16,
  },
})

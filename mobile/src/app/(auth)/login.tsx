import { router } from 'expo-router'
import React, { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { Button, HelperText, Text, TextInput } from 'react-native-paper'

import { tokenStorage } from '@/lib/storage'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth.store'
import { homeForRole } from '@/utils/role-routes'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { login } = useAuthStore()

  const handleLogin = async () => {
    setErrorMessage(null)

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Preencha email e senha para continuar.')
      return
    }

    setIsLoading(true)
    try {
      // Normalize email to lowercase before sending to backend
      const result = await authService.login(email.trim().toLowerCase(), password)

      // Persistir tokens no MMKV
      tokenStorage.setAccessToken(result.accessToken)
      tokenStorage.setRefreshToken(result.refreshToken)

      // Role é validada ANTES de autenticar: chamar login() primeiro deixava a
      // sessão persistida (user + sessionId no MMKV, isAuthenticated true) numa
      // role sem destino, parada na própria tela de login e sem redirect.
      const destination = homeForRole(result.user.role)

      if (!destination) {
        tokenStorage.clearTokens()
        setErrorMessage('Perfil de usuário não suportado neste aplicativo.')
        return
      }

      // Atualizar estado global de autenticação
      login(result.user)
      router.replace(destination)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Erro ao fazer login. Tente novamente.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>
          <Text variant="headlineMedium" style={styles.title}>
            PureUrban
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Faça login para continuar
          </Text>

          <TextInput
            id="login-email"
            label="Email"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            disabled={isLoading}
            style={styles.input}
          />

          <TextInput
            id="login-password"
            label="Senha"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!passwordVisible}
            disabled={isLoading}
            style={styles.input}
            right={
              <TextInput.Icon
                icon={passwordVisible ? 'eye-off' : 'eye'}
                onPress={() => setPasswordVisible((v) => !v)}
              />
            }
          />

          {errorMessage ? (
            <HelperText type="error" visible>
              {errorMessage}
            </HelperText>
          ) : null}

          <Button
            id="login-submit"
            mode="contained"
            onPress={() => void handleLogin()}
            loading={isLoading}
            disabled={isLoading}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            Entrar
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 8,
  },
  title: {
    textAlign: 'center',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 16,
    opacity: 0.7,
  },
  input: {
    marginBottom: 4,
  },
  button: {
    marginTop: 16,
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 6,
  },
})

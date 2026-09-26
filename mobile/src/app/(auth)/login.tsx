import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { Text, TextInput } from 'react-native-paper'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Banner } from '@/components/ui/banner'
import { MdiIcon } from '@/components/ui/mdi-icon'
import { PrimaryAction } from '@/components/ui/primary-action'
import { consumeDiscardNotice } from '@/lib/offline-discard-notice'
import { lightPalette } from '@/lib/palette'
import { tokenStorage } from '@/lib/storage'
import { elevation, motion, radius, spacing, typography } from '@/lib/tokens'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth.store'
import { homeForRole } from '@/utils/role-routes'

// iOS fires "will" events before the keyboard animates; Android only has "did".
const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

const HERO_SHARE = 0.38
const HERO_ICON_SIZE = 56
// Icon + wordmark only: the tagline is what gives way to the keyboard.
const HERO_COMPACT_CONTENT =
  HERO_ICON_SIZE + spacing[2] + typography.headline.lineHeight + spacing[5] * 2
const TAGLINE_HEIGHT = spacing[1] + typography.body.lineHeight
// A ceiling, not a height, so a scaled-up font isn't clipped when expanded.
const TAGLINE_MAX_HEIGHT = TAGLINE_HEIGHT * 3
// Paper's TextInput.Icon is a 40dp IconButton; widen the target to 48dp.
const EYE_HIT_SLOP = { top: 4, right: 4, bottom: 4, left: 4 }

function useKeyboardOpen() {
  const [open, setOpen] = useState(() => Keyboard.isVisible())

  useEffect(() => {
    const show = Keyboard.addListener(SHOW_EVENT, () => setOpen(true))
    const hide = Keyboard.addListener(HIDE_EVENT, () => setOpen(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return open
}

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // D5/AC7: o logout purga a fila do motorista; se havia embarques nunca
  // enviados, ele é avisado aqui — a única superfície que toda saída de sessão
  // atravessa (o 401 do api-client e os guards deslogam sem passar por botão).
  const [discardNotice, setDiscardNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void consumeDiscardNotice().then((notice) => {
      if (cancelled || !notice) return
      setDiscardNotice(
        notice.count === 1
          ? '1 embarque não sincronizado foi descartado ao sair da conta.'
          : `${notice.count} embarques não sincronizados foram descartados ao sair da conta.`,
      )
    })
    return () => {
      cancelled = true
    }
  }, [])

  const { login } = useAuthStore()

  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const reducedMotion = useReducedMotion()
  const keyboardOpen = useKeyboardOpen()
  const compact = useSharedValue(keyboardOpen ? 1 : 0)

  useEffect(() => {
    compact.value = withTiming(keyboardOpen ? 1 : 0, {
      duration: reducedMotion ? motion.reduced : motion.standard,
    })
  }, [compact, keyboardOpen, reducedMotion])

  const compactHeight = insets.top + HERO_COMPACT_CONTENT
  const fullHeight = Math.max(windowHeight * HERO_SHARE, compactHeight + TAGLINE_HEIGHT)

  const heroStyle = useAnimatedStyle(() => ({
    height: interpolate(compact.value, [0, 1], [fullHeight, compactHeight]),
  }))
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: 1 - compact.value,
    maxHeight: interpolate(compact.value, [0, 1], [TAGLINE_MAX_HEIGHT, 0]),
  }))

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
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[styles.hero, { paddingTop: insets.top }, heroStyle]} testID="login-hero">
          <MdiIcon name="bus-school" size={HERO_ICON_SIZE} color={lightPalette.onBrand} />
          <Text style={styles.wordmark} accessibilityRole="header">
            PureUrban
          </Text>
          <Animated.View style={[styles.taglineSlot, taglineStyle]}>
            <Text style={styles.tagline}>Embarque sem carteirinha</Text>
          </Animated.View>
        </Animated.View>

        <View style={styles.cardSlot}>
          <View style={styles.card}>
            {discardNotice ? (
              <Banner tone="warning" message={discardNotice} testID="login-discard-notice" />
            ) : null}

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
            />

            <TextInput
              id="login-password"
              label="Senha"
              value={password}
              onChangeText={setPassword}
              mode="outlined"
              secureTextEntry={!passwordVisible}
              disabled={isLoading}
              right={
                <TextInput.Icon
                  icon={passwordVisible ? 'eye-off' : 'eye'}
                  onPress={() => setPasswordVisible((v) => !v)}
                  accessibilityLabel={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                  hitSlop={EYE_HIT_SLOP}
                />
              }
            />

            {errorMessage ? (
              <Banner tone="error" message={errorMessage} testID="login-error" />
            ) : null}

            <PrimaryAction
              id="login-submit"
              label="Entrar"
              onPress={() => void handleLogin()}
              loading={isLoading}
              testID="login-submit"
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: lightPalette.surfaceSoft,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.sectionGap,
  },
  hero: {
    backgroundColor: lightPalette.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.gutter,
    overflow: 'hidden',
  },
  wordmark: {
    ...typography.headline,
    color: lightPalette.onBrand,
    marginTop: spacing[2],
  },
  taglineSlot: {
    overflow: 'hidden',
  },
  tagline: {
    ...typography.body,
    color: lightPalette.onBrand,
    marginTop: spacing[1],
  },
  cardSlot: {
    width: '100%',
    maxWidth: spacing.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sectionGap,
  },
  card: {
    ...elevation.level1,
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[3],
  },
})

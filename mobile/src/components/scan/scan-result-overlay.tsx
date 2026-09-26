import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import React, { useEffect, useRef } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Text } from 'react-native-paper'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { MdiIcon } from '@/components/ui/mdi-icon'
import { PrimaryAction } from '@/components/ui/primary-action'
import { lightPalette, withAlpha } from '@/lib/palette'
import { fontFamily, motion, spacing, typography } from '@/lib/tokens'
import {
  feedbackHaptic,
  feedbackIcon,
  QUEUED_FEEDBACK,
  type FeedbackHaptic,
  type Tone,
} from '@/utils/scan-feedback'

// Discriminated union instead of loose booleans (architecture.md §6). With
// booleans, `isChecking && isError` is representable and means nothing.
export type ScanResult =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'success'; title: string; detail: string; studentName?: string }
  | {
      kind: 'failure'
      // `ScanFeedback` fields (`@/utils/scan-feedback`), flattened into the union
      // so the render discriminates on `kind` without unwrapping another level.
      code: string
      tone: Tone
      title: string
      detail: string
      canRetry: boolean
      studentName?: string
    }

type SettledResult = Extract<ScanResult, { kind: 'success' | 'failure' }>

const TONE_COLOR: Record<Tone, string> = {
  // Green/amber/red/ink (ink/body family for offline) over the camera black —
  // high contrast, readable in motion and in direct sun (NFR18). Roles from the
  // single palette (`@/lib/palette`); the overlays' white is `onPrimary`.
  success: lightPalette.success,
  warn: lightPalette.warning,
  error: lightPalette.error,
  offline: lightPalette.textBody,
}

const ICON_SIZE = 96
const ICON_CIRCLE = 144
const COUNTDOWN_HEIGHT = 4
const ENTER_SCALE = 0.96
const SHAKE_DP = 8
const SWAY_DEG = 6

const NOTIFICATION: Record<Exclude<FeedbackHaptic, 'light'>, Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
}

function playHaptic(kind: FeedbackHaptic) {
  if (Platform.OS === 'web') return
  const pending =
    kind === 'light'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(NOTIFICATION[kind])
  pending.catch(() => {})
}

function colorOf(result: SettledResult): string {
  return result.kind === 'success' ? TONE_COLOR.success : TONE_COLOR[result.tone]
}

function autoResumes(result: SettledResult): boolean {
  return result.kind === 'success' || result.code === QUEUED_FEEDBACK.code
}

function announcementOf(result: SettledResult): string {
  if (result.kind === 'success') {
    return result.studentName ? `${result.studentName} embarcou` : result.title
  }
  return result.studentName
    ? `${result.title}: ${result.studentName}. ${result.detail}`
    : `${result.title}. ${result.detail}`
}

interface ScanResultOverlayProps {
  result: ScanResult
  onResume: () => void
  onRetry: () => void
  /** Same duration as the screen's auto-resume timer; drives the countdown bar. */
  autoResumeMs: number
}

export function ScanResultOverlay({ result, onResume, onRetry, autoResumeMs }: ScanResultOverlayProps) {
  if (result.kind === 'idle') return null
  if (result.kind === 'checking') {
    return (
      <View style={[styles.overlay, { backgroundColor: lightPalette.primary }]} testID="scan-overlay">
        <View style={styles.message}>
          <ActivityIndicator size="large" color={lightPalette.onPrimary} />
          <Text style={styles.title}>Verificando...</Text>
        </View>
      </View>
    )
  }
  return (
    <SettledOverlay result={result} onResume={onResume} onRetry={onRetry} autoResumeMs={autoResumeMs} />
  )
}

interface SettledOverlayProps {
  result: SettledResult
  onResume: () => void
  onRetry: () => void
  autoResumeMs: number
}

function SettledOverlay({ result, onResume, onRetry, autoResumeMs }: SettledOverlayProps) {
  const reducedMotion = useReducedMotion()
  const color = colorOf(result)
  const resumesAlone = autoResumes(result)

  const opacity = useSharedValue(0)
  const scale = useSharedValue(reducedMotion ? 1 : ENTER_SCALE)
  const shakeX = useSharedValue(0)
  const swayDeg = useSharedValue(0)
  const countdown = useSharedValue(1)
  // StrictMode replays effects with refs intact: without this guard the phone
  // would buzz twice for one check-in in development.
  const hapticFor = useRef<SettledResult | null>(null)

  useEffect(() => {
    if (hapticFor.current !== result) {
      hapticFor.current = result
      playHaptic(feedbackHaptic(result))
    }

    if (reducedMotion) {
      scale.value = 1
      opacity.value = 0
      opacity.value = withTiming(1, { duration: motion.reduced })
    } else {
      scale.value = ENTER_SCALE
      opacity.value = 0
      opacity.value = withTiming(1, { duration: motion.enter })
      scale.value = withTiming(1, { duration: motion.enter })
    }

    const isError = result.kind === 'failure' && result.tone === 'error'
    const isWarn = result.kind === 'failure' && result.tone === 'warn'
    shakeX.value = 0
    swayDeg.value = 0
    if (!reducedMotion && isError) {
      // ±8dp, 3 cycles in 240ms.
      const step = { duration: 40 }
      shakeX.value = withSequence(
        withTiming(-SHAKE_DP, step),
        withTiming(SHAKE_DP, step),
        withTiming(-SHAKE_DP, step),
        withTiming(SHAKE_DP, step),
        withTiming(-SHAKE_DP, step),
        withTiming(0, step),
      )
    }
    if (!reducedMotion && isWarn) {
      // ±6°, 2 cycles in 300ms.
      const step = { duration: 60 }
      swayDeg.value = withSequence(
        withTiming(-SWAY_DEG, step),
        withTiming(SWAY_DEG, step),
        withTiming(-SWAY_DEG, step),
        withTiming(SWAY_DEG, step),
        withTiming(0, step),
      )
    }

    // The countdown is information, not decoration: it stays with reduced motion.
    countdown.value = 1
    if (resumesAlone) {
      countdown.value = withTiming(0, { duration: autoResumeMs, easing: Easing.linear })
    }
  }, [autoResumeMs, countdown, opacity, reducedMotion, result, resumesAlone, scale, shakeX, swayDeg])

  const enterStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }))
  const swayStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${swayDeg.value}deg` }] }))
  const countdownStyle = useAnimatedStyle(() => ({ width: `${countdown.value * 100}%` }))

  const isFailure = result.kind === 'failure'
  const showRetry = isFailure && result.canRetry
  const showGoToTrip = isFailure && result.code === 'TRIP_NOT_ACTIVE'
  // With a white primary action (retry or "Ir para Viagem"), "Escanear
  // próximo" becomes secondary — two stacked white buttons would have no
  // hierarchy at all.
  const hasPrimaryAction = showRetry || showGoToTrip

  const content = (
    <>
      {resumesAlone ? (
        <View style={styles.countdownTrack} testID="scan-overlay-countdown">
          <Animated.View style={[styles.countdownFill, countdownStyle]} testID="scan-overlay-countdown-fill" />
        </View>
      ) : null}
      <Animated.View
        style={[styles.message, shakeStyle]}
        accessible
        accessibilityLabel={announcementOf(result)}
        accessibilityLiveRegion="assertive"
        testID="scan-overlay-message"
      >
        <View style={styles.iconCircle}>
          <Animated.View style={swayStyle}>
            <MdiIcon
              name={feedbackIcon(result)}
              size={ICON_SIZE}
              color={lightPalette.onPrimary}
              testID="scan-overlay-icon"
            />
          </Animated.View>
        </View>
        <Text style={styles.title}>{result.title}</Text>
        {result.studentName ? <Text style={styles.name}>{result.studentName}</Text> : null}
        <Text style={styles.detail}>{result.detail}</Text>
      </Animated.View>
      <View style={styles.actions}>
        {showRetry ? (
          <PrimaryAction
            label="Tentar novamente"
            variant="on-color"
            color={color}
            onPress={onRetry}
            testID="scan-overlay-retry"
          />
        ) : null}
        {/* State 12 is the only Truth Table row that calls for this
            affordance: without it the driver reads "Inicie uma viagem antes de
            registrar embarques" with no way to get there. */}
        {showGoToTrip ? (
          <PrimaryAction
            label="Ir para Viagem"
            variant="on-color"
            color={color}
            onPress={() => router.navigate('/(driver)/trip')}
            testID="scan-overlay-go-to-trip"
          />
        ) : null}
        <PrimaryAction
          label="Escanear próximo"
          variant={hasPrimaryAction ? 'quiet' : 'on-color'}
          color={hasPrimaryAction ? lightPalette.onPrimary : color}
          onPress={onResume}
          testID="scan-overlay-resume"
        />
      </View>
    </>
  )

  return (
    <Animated.View style={[styles.overlay, { backgroundColor: color }, enterStyle]} testID="scan-overlay">
      {resumesAlone ? (
        // Touch shortcut only: the "Escanear próximo" button stays the
        // accessible way to resume, so this isn't a second a11y button.
        <Pressable
          style={styles.fill}
          onPress={onResume}
          accessible={false}
          testID="scan-overlay-dismiss"
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.fill}>{content}</View>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // Full-screen result overlay: in motion, the driver has no time to look for a
  // snackbar at the bottom (NFR18).
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  fill: {
    flex: 1,
    paddingHorizontal: spacing[5],
  },
  countdownTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COUNTDOWN_HEIGHT,
    backgroundColor: withAlpha(lightPalette.onPrimary, 0.2),
  },
  countdownFill: {
    height: '100%',
    backgroundColor: lightPalette.onPrimary,
  },
  // The message fills the free space, centered; the actions sit in the lower
  // half, within thumb reach for a one-handed grip (NFR18 / Task 7.10).
  message: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  iconCircle: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: ICON_CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
    backgroundColor: withAlpha(lightPalette.onPrimary, 0.2),
  },
  title: {
    ...typography.headline,
    color: lightPalette.onPrimary,
    textAlign: 'center',
  },
  name: {
    ...typography.titleLg,
    color: lightPalette.onPrimary,
    textAlign: 'center',
  },
  // D-UX-9: the amber overlay only reaches contrast with bold text >= 20px, so
  // the detail sits above the `title` token's 18px for every tone.
  detail: {
    ...typography.title,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 27,
    color: lightPalette.onPrimary,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing[3],
    paddingBottom: spacing[6],
  },
})

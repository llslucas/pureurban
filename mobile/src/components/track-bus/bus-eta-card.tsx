import React, { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { StatusChip } from '@/components/ui/status-chip'
import { toneColors } from '@/lib/boarding-status'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
import { radius, spacing, typography } from '@/lib/tokens'

export type BusEtaFreshness = { kind: 'live' } | { kind: 'stale'; minutes: number }

export interface BusEtaCardProps {
  eta: string | null
  distance: string | null
  /** Shown in place of the distance while it is unknown. */
  pendingLine?: string
  freshness: BusEtaFreshness
  caption: string
  captionAccessibilityLabel: string
  testID?: string
}

export function signalLossLabel(minutes: number): string {
  return minutes < 1 ? 'Sem sinal GPS' : `Sem sinal GPS há ${Math.floor(minutes)} min`
}

// EXPERIENCE.md → Microinterações: "Ao vivo" dot pulses (scale 1→1.6, opacity 0.6→0)
// on a 1.6s loop. Not a token: tokens.test.ts pins the motion scale.
const PULSE_LOOP_MS = 1600
const PULSE_MAX_SCALE = 1.6
const PULSE_START_OPACITY = 0.6
const DOT_SIZE = 8
const CHIP_HEIGHT = 32
const ETA_MAX_FONT_SCALE = 1.5

function LiveChip({ testID }: { testID: string }) {
  const reducedMotion = useReducedMotion()
  const progress = useSharedValue(0)
  const { custom } = useAppTheme()
  const styles = useThemedStyles(createStyles)
  const tone = toneColors('success', custom.palette, custom.tints)

  useEffect(() => {
    if (reducedMotion) return
    progress.value = 0
    progress.value = withRepeat(
      withTiming(1, { duration: PULSE_LOOP_MS, easing: Easing.out(Easing.ease) }),
      -1,
    )
    return () => cancelAnimation(progress)
  }, [progress, reducedMotion])

  const haloStyle = useAnimatedStyle(() => ({
    opacity: PULSE_START_OPACITY * (1 - progress.value),
    transform: [{ scale: 1 + (PULSE_MAX_SCALE - 1) * progress.value }],
  }))

  return (
    <View
      style={[styles.chip, { backgroundColor: tone.background }]}
      accessible
      accessibilityLabel="Ao vivo"
      testID={testID}
    >
      <View
        style={styles.dotBox}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {reducedMotion ? null : (
          <Animated.View
            style={[styles.dot, styles.halo, { backgroundColor: tone.color }, haloStyle]}
            testID={`${testID}-halo`}
          />
        )}
        <View style={[styles.dot, { backgroundColor: tone.color }]} testID={`${testID}-dot`} />
      </View>
      <Text style={[styles.chipLabel, { color: tone.color }]}>Ao vivo</Text>
    </View>
  )
}

export function BusEtaCard({
  eta,
  distance,
  pendingLine,
  freshness,
  caption,
  captionAccessibilityLabel,
  testID = 'bus-eta-card',
}: BusEtaCardProps) {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.label}>Ônibus da sua rota</Text>
        {freshness.kind === 'live' ? (
          <LiveChip testID="bus-eta-live" />
        ) : (
          <StatusChip
            label={signalLossLabel(freshness.minutes)}
            icon="crosshairs-off"
            tone="warning"
            testID="bus-eta-stale"
          />
        )}
      </View>
      <Text
        style={styles.eta}
        maxFontSizeMultiplier={ETA_MAX_FONT_SCALE}
        accessibilityLabel={
          eta === null ? 'Tempo estimado indisponível' : `Tempo estimado de chegada: ${eta}`
        }
        testID="bus-eta-value"
      >
        {eta ?? '—'}
      </Text>
      {distance !== null ? (
        <Text style={styles.distance} testID="bus-eta-distance">
          {distance}
        </Text>
      ) : pendingLine ? (
        <Text style={styles.pending} testID="bus-eta-pending">
          {pendingLine}
        </Text>
      ) : null}
      <Text
        style={styles.caption}
        accessibilityLabel={captionAccessibilityLabel}
        testID="bus-eta-caption"
      >
        {caption}
      </Text>
    </View>
  )
}

const createStyles = ({ custom: { palette, elevation } }: AppTheme) =>
  StyleSheet.create({
    card: {
      ...elevation.level1,
      borderRadius: radius.lg,
      padding: spacing[4],
      gap: spacing[2],
    },
    header: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing[2],
      marginBottom: spacing[1],
    },
    label: {
      ...typography.label,
      color: palette.textBody,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: CHIP_HEIGHT,
      paddingHorizontal: spacing[3],
      gap: spacing[2],
      borderRadius: radius.full,
    },
    dotBox: {
      width: DOT_SIZE,
      height: DOT_SIZE,
    },
    dot: {
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: radius.full,
    },
    halo: {
      position: 'absolute',
      top: 0,
      left: 0,
    },
    chipLabel: {
      ...typography.label,
    },
    eta: {
      ...typography.displayCount,
      color: palette.text,
      fontVariant: ['tabular-nums'],
    },
    distance: {
      ...typography.title,
      color: palette.text,
    },
    pending: {
      ...typography.body,
      color: palette.textBody,
    },
    caption: {
      ...typography.caption,
      color: palette.textMuted,
      marginTop: spacing[1],
    },
  })

import React, { type ReactNode, useLayoutEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { StatusChip, type StatusChipProps } from '@/components/ui/status-chip'
import { lightPalette } from '@/lib/palette'
import { elevation, motion, radius, spacing, typography } from '@/lib/tokens'

export interface TripStatusCardProps {
  /** Changing it replays the entrance fade (a new state, not a new tick). */
  stateKey: string
  chip?: StatusChipProps
  title?: string
  detail?: string
  caption?: string
  children?: ReactNode
  testID?: string
}

// EXPERIENCE.md → Microinterações: "Não vou voltar" confirmado cross-fades in 250ms.
export const STATE_FADE_MS = 250

export function TripStatusCard({
  stateKey,
  chip,
  title,
  detail,
  caption,
  children,
  testID = 'trip-status-card',
}: TripStatusCardProps) {
  const reducedMotion = useReducedMotion()
  const progress = useSharedValue(0)

  const shownKey = useRef<string | null>(null)

  // Layout effect: the new state must not paint at full opacity for a frame
  // before the fade starts. The ref keeps re-renders of the same state still.
  useLayoutEffect(() => {
    if (shownKey.current === stateKey) return
    shownKey.current = stateKey
    progress.value = 0
    progress.value = withTiming(1, { duration: reducedMotion ? motion.reduced : STATE_FADE_MS })
  }, [stateKey, progress, reducedMotion])

  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }))

  return (
    <Animated.View style={[styles.card, fadeStyle]} testID={testID}>
      <Text style={styles.overline}>Viagem de volta</Text>
      {chip ? <StatusChip {...chip} testID={`${testID}-chip`} /> : null}
      {title ? (
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      {children ? <View style={styles.extra}>{children}</View> : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    ...elevation.level1,
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[2],
  },
  overline: {
    ...typography.overline,
    color: lightPalette.textMuted,
    textTransform: 'uppercase',
  },
  title: {
    ...typography.title,
    color: lightPalette.text,
  },
  detail: {
    ...typography.body,
    color: lightPalette.textBody,
  },
  caption: {
    ...typography.caption,
    color: lightPalette.textMuted,
  },
  extra: {
    marginTop: spacing[2],
    gap: spacing[3],
  },
})

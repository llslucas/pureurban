import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { MdiIcon } from '@/components/ui/mdi-icon'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
import { fontFamily, radius, spacing, typography } from '@/lib/tokens'

export interface CountdownPillProps {
  remainingMs: number
  /** Prefix of the visible text, e.g. "Desfazer em". */
  label: string
  testID?: string
}

const ICON_SIZE = 18
const PILL_HEIGHT = 32
export const COUNTDOWN_URGENT_MS = 30_000

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function CountdownPill({ remainingMs, label, testID = 'countdown-pill' }: CountdownPillProps) {
  const { palette } = useAppTheme().custom
  const styles = useThemedStyles(createStyles)
  const urgent = remainingMs <= COUNTDOWN_URGENT_MS
  // The label changes once a minute, so the live region announces per minute
  // instead of every tick.
  const minutesLeft = Math.max(1, Math.ceil(remainingMs / 60_000))

  return (
    <View
      style={styles.pill}
      accessible
      accessibilityLabel={`${label} até ${minutesLeft} min`}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <MdiIcon name="timer-sand" size={ICON_SIZE} color={palette.warning} testID={`${testID}-icon`} />
      <Text style={[styles.text, urgent && styles.urgent]} testID={`${testID}-text`}>
        {`${label} ${formatCountdown(remainingMs)}`}
      </Text>
    </View>
  )
}

const createStyles = ({ custom: { palette, tints } }: AppTheme) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      minHeight: PILL_HEIGHT,
      paddingHorizontal: spacing[3],
      gap: spacing[1],
      borderRadius: radius.full,
      backgroundColor: tints.warning,
    },
    text: {
      ...typography.label,
      color: palette.text,
      fontVariant: ['tabular-nums'],
    },
    urgent: {
      color: palette.warning,
      fontFamily: fontFamily.bold,
      fontWeight: '700',
    },
  })

import React, { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { lightPalette } from '@/lib/palette'
import { motion, radius, spacing, typography } from '@/lib/tokens'

export interface BoardingSummary {
  boarded: number
  total: number
}

export interface BoardingCounterProps {
  /** Server summary (FR25); undefined while it loads. */
  summary: BoardingSummary | undefined
  testID?: string
}

const BAR_HEIGHT = 8
// The count is the hero: it may grow with the system font, but not blow the card.
const MAX_FONT_SCALE = 1.5

function ratioOf(summary: BoardingSummary | undefined): number {
  if (!summary || summary.total <= 0) return 0
  return Math.min(1, Math.max(0, summary.boarded / summary.total))
}

export function BoardingCounter({ summary, testID = 'boarding-counter' }: BoardingCounterProps) {
  const reducedMotion = useReducedMotion()
  const ratio = ratioOf(summary)
  const hasSummary = summary !== undefined
  // The first known count is shown as is, even when it arrives after mount:
  // opening the screen must not replay the growth from zero. Only later changes animate.
  const seeded = useRef(hasSummary)
  const progress = useSharedValue(ratio)

  useEffect(() => {
    if (!seeded.current) {
      if (!hasSummary) return
      seeded.current = true
      progress.value = ratio
      return
    }
    progress.value = reducedMotion ? ratio : withTiming(ratio, { duration: motion.progress })
  }, [hasSummary, progress, ratio, reducedMotion])

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }))

  // A zero while loading would read as "nobody boarded".
  const a11yLabel = summary ? `${summary.boarded} de ${summary.total} embarcados` : 'Contagem de embarque indisponível'

  return (
    <View style={styles.root} accessible accessibilityLabel={a11yLabel} testID={testID}>
      <View style={styles.countRow}>
        <Text style={styles.count} maxFontSizeMultiplier={MAX_FONT_SCALE} testID={`${testID}-value`}>
          {summary ? (
            <>
              {summary.boarded}
              <Text style={styles.denominator} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                /{summary.total}
              </Text>
            </>
          ) : (
            '—'
          )}
        </Text>
        <Text style={styles.caption}>embarcados</Text>
      </View>
      <View style={styles.track} testID={`${testID}-track`}>
        <Animated.View style={[styles.fill, fillStyle]} testID={`${testID}-fill`} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing[2],
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: spacing[2],
  },
  count: {
    ...typography.displayCount,
    color: lightPalette.text,
    fontVariant: ['tabular-nums'],
  },
  denominator: {
    color: lightPalette.textMuted,
  },
  caption: {
    ...typography.bodyLg,
    color: lightPalette.textMuted,
  },
  track: {
    height: BAR_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: lightPalette.surfaceStrong,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: lightPalette.success,
  },
})

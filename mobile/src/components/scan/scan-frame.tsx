import React, { useEffect, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
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

import { lightPalette, withAlpha } from '@/lib/palette'
import { spacing, typography } from '@/lib/tokens'

interface ScanFrameProps {
  /** A result is on screen: the sweep stops. */
  isPaused: boolean
}

// Share of the screen's smaller dimension taken by the scan window. A ratio,
// not fixed pixels: an absolute size overflows on devices ≤ 368dp (iPhone SE
// and the whole 360dp Android class) — a 3.2b review finding.
const WINDOW_RATIO = 0.7
const CORNER = 36
const CORNER_WIDTH = 5
const LINE_HEIGHT = 2
// One way; `withRepeat` reverses it, so a full down-and-up pass is 1.8s.
const SWEEP_MS = 900

function Corner({ style }: { style: object }) {
  return <View style={[styles.corner, style]} />
}

function ScanLine({ travel }: { travel: number }) {
  const offset = useSharedValue(0)

  useEffect(() => {
    offset.value = 0
    offset.value = withRepeat(
      withTiming(travel, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    )
    return () => cancelAnimation(offset)
  }, [offset, travel])

  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))

  return <Animated.View style={[styles.line, lineStyle]} testID="scan-frame-line" />
}

/**
 * Dark mask with the window cut out: gives the driver an obvious target to aim
 * at instead of a camera image with no reference (AC #1). Four explicit panels
 * instead of the `borderWidth: 9999` trick — the trick zeroes the inner radius
 * and behaves differently on iOS and Android; four Views are predictable on both.
 */
export function ScanFrame({ isPaused }: ScanFrameProps) {
  const { width, height } = useWindowDimensions()
  const reducedMotion = useReducedMotion()
  const windowSize = Math.min(width, height) * WINDOW_RATIO
  // The line only starts once the window is laid out, so it never sweeps a
  // stale size after a rotation or a resize on web.
  const [measured, setMeasured] = useState(0)
  const sweeping = !isPaused && !reducedMotion && measured > 0

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="scan-frame">
      <View style={styles.maskPanel} />
      <View style={styles.maskMiddleRow}>
        <View style={styles.maskPanel} />
        <View
          style={[styles.window, { width: windowSize, height: windowSize }]}
          onLayout={(event) => setMeasured(event.nativeEvent.layout.height)}
        >
          {sweeping ? <ScanLine travel={measured - LINE_HEIGHT} /> : null}
          <Corner style={styles.topLeft} />
          <Corner style={styles.topRight} />
          <Corner style={styles.bottomLeft} />
          <Corner style={styles.bottomRight} />
        </View>
        <View style={styles.maskPanel} />
      </View>
      <View style={styles.maskPanel}>
        <Text style={styles.hint}>Aponte para o QR do aluno</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Palette guard allowlist: dark mask around the window — camera chrome, not a
  // UI color.
  maskPanel: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  maskMiddleRow: {
    flexDirection: 'row',
    // NO `alignItems: 'center'`: with `center`, the two panels beside the
    // window have no height of their own (only `flex: 1`, which governs width
    // here) and compute to 0dp — the sides of the middle band stayed undimmed
    // and the "frame" became an edge-to-edge horizontal slit. The default
    // `stretch` makes the panels follow the window's height.
    justifyContent: 'center',
    // Same overhang, below: keeps the bottom corners above the hint panel.
    zIndex: 1,
  },
  window: {
    // No background: it is the cutout the camera shows through.
    backgroundColor: 'transparent',
    // The corners overhang the window by their stroke; without this the right
    // mask panel, painted later, covers that overhang.
    zIndex: 1,
  },
  line: {
    position: 'absolute',
    top: 0,
    left: spacing[2],
    right: spacing[2],
    height: LINE_HEIGHT,
    backgroundColor: withAlpha(lightPalette.onPrimary, 0.6),
  },
  // White corners on the dark mask: maximum contrast, readable in direct sun
  // and with the bus moving (NFR18).
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: lightPalette.onPrimary,
  },
  topLeft: {
    top: -CORNER_WIDTH,
    left: -CORNER_WIDTH,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: 20,
  },
  topRight: {
    top: -CORNER_WIDTH,
    right: -CORNER_WIDTH,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: 20,
  },
  bottomLeft: {
    bottom: -CORNER_WIDTH,
    left: -CORNER_WIDTH,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: 20,
  },
  bottomRight: {
    bottom: -CORNER_WIDTH,
    right: -CORNER_WIDTH,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: 20,
  },
  hint: {
    ...typography.bodyLg,
    color: lightPalette.onPrimary,
    textAlign: 'center',
    marginTop: spacing[5],
    paddingHorizontal: spacing.gutter,
  },
})

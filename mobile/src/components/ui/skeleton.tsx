import React, { useEffect, useState } from 'react'
import {
  type DimensionValue,
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { lightPalette } from '@/lib/palette'
import { radius } from '@/lib/tokens'

export interface SkeletonProps {
  width?: DimensionValue
  height: number
  borderRadius?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}

const SHIMMER_MS = 1200
const HIGHLIGHT_OPACITY = 0.5

export function Skeleton({ width = '100%', height, borderRadius = radius.sm, style, testID = 'skeleton' }: SkeletonProps) {
  const reducedMotion = useReducedMotion()
  const [blockWidth, setBlockWidth] = useState(0)
  const progress = useSharedValue(0)

  useEffect(() => {
    if (reducedMotion || blockWidth === 0) return
    progress.value = 0
    progress.value = withRepeat(withTiming(1, { duration: SHIMMER_MS, easing: Easing.linear }), -1)
    return () => cancelAnimation(progress)
  }, [blockWidth, progress, reducedMotion])

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -blockWidth + progress.value * blockWidth * 2 }],
  }))

  const onLayout = (event: LayoutChangeEvent) => setBlockWidth(event.nativeEvent.layout.width)

  return (
    <View
      style={[styles.block, { width, height, borderRadius }, style]}
      onLayout={onLayout}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {reducedMotion ? null : (
        <Animated.View
          style={[styles.highlight, { width: blockWidth }, highlightStyle]}
          testID={`${testID}-shimmer`}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    overflow: 'hidden',
    backgroundColor: lightPalette.surfaceStrong,
  },
  highlight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: lightPalette.canvas,
    opacity: HIGHLIGHT_OPACITY,
  },
})

import React, { type ReactNode, useEffect, useState } from 'react'
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

import { type AppTheme, useThemedStyles } from '@/lib/theme'
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
  const styles = useThemedStyles(createStyles)
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

export interface SkeletonGroupProps {
  /** The loading state's accessible name, e.g. "Carregando viagem...". */
  label: string
  children: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}

// Every Skeleton is hidden from assistive tech, so without a labelled container
// a screen reader would land on an empty screen while it loads.
export function SkeletonGroup({ label, children, style, testID = 'skeleton-group' }: SkeletonGroupProps) {
  return (
    <View
      style={style}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      testID={testID}
    >
      {children}
    </View>
  )
}

const createStyles = ({ custom: { palette, layers } }: AppTheme) =>
  StyleSheet.create({
    block: {
      overflow: 'hidden',
      backgroundColor: palette.surfaceStrong,
    },
    highlight: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: layers.shimmer,
      opacity: HIGHLIGHT_OPACITY,
    },
  })

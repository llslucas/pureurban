import React, { useCallback } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Text } from 'react-native-paper'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { MdiIcon, type MdiIconName } from '@/components/ui/mdi-icon'
import { lightPalette } from '@/lib/palette'
import { elevation, motion, radius, spacing, typography } from '@/lib/tokens'

export interface ShortcutCardProps {
  label: string
  icon: MdiIconName
  onPress: () => void
  testID?: string
}

export const SHORTCUT_HEIGHT = 112
const ICON_SIZE = 32

export function ShortcutCard({ label, icon, onPress, testID = 'shortcut-card' }: ShortcutCardProps) {
  const reducedMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  const pressTo = useCallback(
    (value: number) => {
      if (reducedMotion) {
        scale.value = 1
        return
      }
      scale.value = withTiming(value, { duration: motion.press })
    },
    [reducedMotion, scale],
  )

  return (
    <Animated.View style={[styles.slot, animatedStyle]} testID={`${testID}-slot`}>
      <Pressable
        onPress={onPress}
        onPressIn={() => pressTo(motion.pressScale)}
        onPressOut={() => pressTo(1)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.card}
        testID={testID}
      >
        <MdiIcon name={icon} size={ICON_SIZE} color={lightPalette.text} testID={`${testID}-icon`} />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
  },
  card: {
    ...elevation.level1,
    minHeight: SHORTCUT_HEIGHT,
    borderRadius: radius.lg,
    padding: spacing[4],
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  label: {
    ...typography.title,
    color: lightPalette.text,
  },
})

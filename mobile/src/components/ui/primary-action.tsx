import * as Haptics from 'expo-haptics'
import React, { useCallback } from 'react'
import { Platform, StyleSheet } from 'react-native'
import { Button } from 'react-native-paper'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { MdiIcon, type MdiIconName } from '@/components/ui/mdi-icon'
import { lightPalette } from '@/lib/palette'
import { motion, radius, spacing, typography } from '@/lib/tokens'

export type PrimaryActionVariant = 'primary' | 'secondary' | 'danger' | 'on-color' | 'quiet'

export interface PrimaryActionProps {
  label: string
  onPress: () => void
  icon?: MdiIconName
  variant?: PrimaryActionVariant
  loading?: boolean
  disabled?: boolean
  /** Impact actions (start/end trip, "não vou voltar") get a selection haptic. */
  impact?: boolean
  /** Label color for `on-color` (the overlay tone) and `quiet` (e.g. on a solid banner). */
  color?: string
  /** Becomes the DOM `id` on web; e2e selectors rely on it. */
  id?: string
  testID?: string
}

const ICON_SIZE = 22

interface VariantStyle {
  mode: 'contained' | 'outlined' | 'text'
  buttonColor?: string
  textColor: string
  height: number
}

function variantStyle(variant: PrimaryActionVariant, color?: string): VariantStyle {
  switch (variant) {
    case 'secondary':
      return { mode: 'outlined', buttonColor: lightPalette.canvas, textColor: lightPalette.text, height: spacing.actionHeight }
    case 'danger':
      return { mode: 'contained', buttonColor: lightPalette.error, textColor: lightPalette.onPrimary, height: spacing.actionHeight }
    case 'on-color':
      return { mode: 'contained', buttonColor: lightPalette.onPrimary, textColor: color ?? lightPalette.text, height: spacing.actionHeight }
    case 'quiet':
      return { mode: 'text', textColor: color ?? lightPalette.text, height: spacing.touchMin }
    case 'primary':
    default:
      return { mode: 'contained', buttonColor: lightPalette.primary, textColor: lightPalette.onPrimary, height: spacing.actionHeight }
  }
}

export function PrimaryAction({
  label,
  onPress,
  icon,
  variant = 'primary',
  loading = false,
  disabled = false,
  impact = false,
  color,
  id,
  testID = 'primary-action',
}: PrimaryActionProps) {
  const reducedMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const look = variantStyle(variant, color)
  const inert = loading || disabled

  const pressTo = useCallback(
    (value: number) => {
      if (inert) return
      // Snap back rather than skip: reduced motion flipping mid-press must not
      // leave the button stuck scaled down.
      if (reducedMotion) {
        scale.value = 1
        return
      }
      scale.value = withTiming(value, { duration: motion.press })
    },
    [inert, reducedMotion, scale],
  )

  // `loading` keeps the button enabled-looking (no grey flash mid-request) but
  // swallows the press, so a double tap never fires the action twice.
  const handlePress = useCallback(() => {
    if (inert) return
    if (impact && Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {})
    }
    onPress()
  }, [impact, inert, onPress])

  return (
    <Animated.View style={[variant !== 'quiet' && styles.stretch, animatedStyle]}>
      <Button
        mode={look.mode}
        buttonColor={look.buttonColor}
        textColor={look.textColor}
        onPress={handlePress}
        onPressIn={() => pressTo(motion.pressScale)}
        onPressOut={() => pressTo(1)}
        disabled={disabled}
        loading={loading}
        icon={icon ? ({ color: iconColor }) => <MdiIcon name={icon} size={ICON_SIZE} color={iconColor} /> : undefined}
        id={id}
        testID={testID}
        style={[styles.button, variant === 'secondary' && styles.secondary]}
        contentStyle={{ minHeight: look.height }}
        labelStyle={styles.label}
      >
        {label}
      </Button>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  stretch: {
    alignSelf: 'stretch',
  },
  button: {
    borderRadius: radius.md,
  },
  // `hairline` doesn't reach 3:1 against the canvas (WCAG 1.4.11).
  secondary: {
    borderColor: lightPalette.borderStrong,
  },
  label: {
    fontFamily: typography.button.fontFamily,
    fontSize: typography.button.fontSize,
    fontWeight: typography.button.fontWeight,
    lineHeight: typography.button.lineHeight,
    letterSpacing: typography.button.letterSpacing,
  },
})

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
import type { SemanticColors } from '@/lib/palette'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
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
  /** Label/icon color for `on-color` (overlay tone), `quiet` (solid banner) and `secondary` (e.g. a red "Encerrar"). */
  color?: string
  /** Becomes the DOM `id` on web; e2e selectors rely on it. */
  id?: string
  testID?: string
}

const ICON_SIZE = 22

const ACTIVATE = [{ name: 'activate' as const }]

interface VariantStyle {
  mode: 'contained' | 'outlined' | 'text'
  buttonColor?: string
  textColor: string
  height: number
}

function variantStyle(variant: PrimaryActionVariant, palette: SemanticColors, color?: string): VariantStyle {
  switch (variant) {
    case 'secondary':
      return { mode: 'outlined', buttonColor: palette.canvas, textColor: color ?? palette.text, height: spacing.actionHeight }
    case 'danger':
      return { mode: 'contained', buttonColor: palette.error, textColor: palette.onPrimary, height: spacing.actionHeight }
    case 'on-color':
      return { mode: 'contained', buttonColor: palette.onPrimary, textColor: color ?? palette.text, height: spacing.actionHeight }
    case 'quiet':
      return { mode: 'text', textColor: color ?? palette.text, height: spacing.touchMin }
    case 'primary':
    default:
      return { mode: 'contained', buttonColor: palette.primary, textColor: palette.onPrimary, height: spacing.actionHeight }
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
  const { palette } = useAppTheme().custom
  const styles = useThemedStyles(createStyles)
  const look = variantStyle(variant, palette, color)
  const inert = loading || disabled
  // Paper's Button hardcodes `accessibilityState={{ disabled }}` on its inner
  // touchable, so `busy` can't reach it: on native the wrapper becomes the
  // accessible element instead. Web keeps Paper's own button, because a second
  // nested role="button" would make every e2e `getByRole('button')` ambiguous.
  const a11yOnWrapper = Platform.OS !== 'web'

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
    <Animated.View
      style={[variant !== 'quiet' && styles.stretch, animatedStyle]}
      {...(a11yOnWrapper && {
        accessible: true,
        accessibilityRole: 'button' as const,
        accessibilityLabel: label,
        accessibilityState: { busy: loading, disabled: inert },
        accessibilityActions: ACTIVATE,
        onAccessibilityAction: handlePress,
      })}
      // No role on web: only the in-flight state, next to Paper's own button.
      aria-busy={a11yOnWrapper ? undefined : loading}
    >
      <Button
        accessible={!a11yOnWrapper}
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

const createStyles = ({ custom: { palette } }: AppTheme) =>
  StyleSheet.create({
    stretch: {
      alignSelf: 'stretch',
    },
    button: {
      borderRadius: radius.md,
    },
    // `hairline` doesn't reach 3:1 against the canvas (WCAG 1.4.11).
    secondary: {
      borderColor: palette.borderStrong,
    },
    label: {
      fontFamily: typography.button.fontFamily,
      fontSize: typography.button.fontSize,
      fontWeight: typography.button.fontWeight,
      lineHeight: typography.button.lineHeight,
      letterSpacing: typography.button.letterSpacing,
    },
  })

import React, { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { MdiIcon, type MdiIconName } from '@/components/ui/mdi-icon'
import { PrimaryAction } from '@/components/ui/primary-action'
import { lightPalette, statusTints } from '@/lib/palette'
import { motion, radius, spacing, typography } from '@/lib/tokens'

export type BannerTone = 'warning' | 'info' | 'error'

export interface BannerProps {
  tone: BannerTone
  title?: string
  message: string
  action?: { label: string; onPress: () => void }
  testID?: string
}

interface BannerLook {
  icon: MdiIconName
  iconColor: string
  textColor: string
  background: string
}

// DESIGN.md → banner-warning / banner-error; info mirrors warning on its own tint.
export const BANNER_TONES: Record<BannerTone, BannerLook> = {
  warning: {
    icon: 'alert',
    iconColor: lightPalette.warning,
    textColor: lightPalette.text,
    background: statusTints.warning,
  },
  info: {
    icon: 'information-outline',
    iconColor: lightPalette.info,
    textColor: lightPalette.text,
    background: statusTints.info,
  },
  error: {
    icon: 'alert-circle',
    iconColor: lightPalette.onPrimary,
    textColor: lightPalette.onPrimary,
    background: lightPalette.error,
  },
}

const ICON_SIZE = 22
const SLIDE_DISTANCE = spacing[3]

export function Banner({ tone, title, message, action, testID = 'banner' }: BannerProps) {
  const reducedMotion = useReducedMotion()
  const look = BANNER_TONES[tone]
  const progress = useSharedValue(0)
  // Reduced motion keeps a short fade and drops the slide.
  const distance = reducedMotion ? 0 : SLIDE_DISTANCE

  useEffect(() => {
    progress.value = withTiming(1, { duration: reducedMotion ? motion.reduced : motion.standard })
  }, [progress, reducedMotion])

  const enterStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (progress.value - 1) * distance }],
  }))

  return (
    <Animated.View
      style={[styles.banner, { backgroundColor: look.background }, enterStyle]}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <View style={styles.row}>
        <MdiIcon name={look.icon} size={ICON_SIZE} color={look.iconColor} testID={`${testID}-icon`} />
        <View style={styles.texts}>
          {title ? <Text style={[styles.title, { color: look.textColor }]}>{title}</Text> : null}
          <Text style={[styles.message, { color: look.textColor }]}>{message}</Text>
        </View>
      </View>
      {action ? (
        <View style={styles.action}>
          <PrimaryAction
            variant="quiet"
            label={action.label}
            onPress={action.onPress}
            color={look.textColor}
            testID={`${testID}-action`}
          />
        </View>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.md,
    paddingTop: spacing[3],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[1],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingBottom: spacing[2],
  },
  texts: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    ...typography.label,
  },
  message: {
    ...typography.body,
  },
  action: {
    alignSelf: 'flex-end',
  },
})

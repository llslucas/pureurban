import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { MdiIcon, type MdiIconName } from '@/components/ui/mdi-icon'
import { type ChipTone, presentationOf, toneColors, type ToneColors } from '@/lib/boarding-status'
import type { SemanticColors, StatusTints } from '@/lib/palette'
import { useAppTheme } from '@/lib/theme'
import { radius, spacing, typography } from '@/lib/tokens'
import type { BoardingStatus } from '@/services/trip.service'

export type { ChipTone }

export const CHIP_TONE_NAMES: readonly ChipTone[] = ['success', 'warning', 'error', 'info', 'neutral']

export function chipTones(palette: SemanticColors, tints: StatusTints): Record<ChipTone, ToneColors> {
  return Object.fromEntries(
    CHIP_TONE_NAMES.map((tone) => [tone, toneColors(tone, palette, tints)]),
  ) as Record<ChipTone, ToneColors>
}

export type StatusChipProps =
  | { status: BoardingStatus; testID?: string }
  | { label: string; icon: MdiIconName; tone: ChipTone; accessibilityLabel?: string; testID?: string }

interface ChipLook {
  label: string
  icon: MdiIconName
  color: string
  background: string
  accessibilityLabel: string
}

function resolve(props: StatusChipProps, palette: SemanticColors, tints: StatusTints): ChipLook {
  if ('status' in props) {
    const p = presentationOf(props.status)
    return {
      label: p.label,
      icon: p.mdiIcon,
      ...toneColors(p.tone, palette, tints),
      accessibilityLabel: p.accessibilityLabel,
    }
  }
  return {
    label: props.label,
    icon: props.icon,
    ...toneColors(props.tone, palette, tints),
    accessibilityLabel: props.accessibilityLabel ?? props.label,
  }
}

const CHIP_HEIGHT = 32
const ICON_SIZE = 18

export function StatusChip(props: StatusChipProps) {
  const { custom } = useAppTheme()
  const look = resolve(props, custom.palette, custom.tints)
  const testID = props.testID ?? 'status-chip'

  return (
    <View
      style={[styles.chip, { backgroundColor: look.background }]}
      accessible
      accessibilityLabel={look.accessibilityLabel}
      testID={testID}
    >
      <MdiIcon name={look.icon} size={ICON_SIZE} color={look.color} testID={`${testID}-icon`} />
      <Text style={[styles.label, { color: look.color }]}>
        {look.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
    minHeight: CHIP_HEIGHT,
    paddingHorizontal: spacing[3],
    gap: spacing[1],
    borderRadius: radius.full,
  },
  label: {
    ...typography.label,
    flexShrink: 1,
  },
})

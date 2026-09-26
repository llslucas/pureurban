import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { MdiIcon, type MdiIconName } from '@/components/ui/mdi-icon'
import { STATUS_PRESENTATION } from '@/lib/boarding-status'
import { lightPalette, statusTints } from '@/lib/palette'
import { radius, spacing, typography } from '@/lib/tokens'
import type { BoardingStatus } from '@/services/trip.service'

export type ChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

export const CHIP_TONES: Record<ChipTone, { color: string; background: string }> = {
  success: { color: lightPalette.success, background: statusTints.success },
  warning: { color: lightPalette.warning, background: statusTints.warning },
  error: { color: lightPalette.error, background: statusTints.error },
  info: { color: lightPalette.info, background: statusTints.info },
  neutral: { color: lightPalette.textBody, background: statusTints.neutral },
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

function resolve(props: StatusChipProps): ChipLook {
  if ('status' in props) {
    // A status from an older contract rehydrated from the cache falls back like
    // the StudentCard does instead of crashing the row.
    const p = STATUS_PRESENTATION[props.status] ?? STATUS_PRESENTATION.NOT_CHECKED_IN
    return {
      label: p.label,
      icon: p.mdiIcon,
      color: p.color,
      background: p.background,
      accessibilityLabel: p.accessibilityLabel,
    }
  }
  return {
    label: props.label,
    icon: props.icon,
    ...CHIP_TONES[props.tone],
    accessibilityLabel: props.accessibilityLabel ?? props.label,
  }
}

const CHIP_HEIGHT = 32
const ICON_SIZE = 18

export function StatusChip(props: StatusChipProps) {
  const look = resolve(props)
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

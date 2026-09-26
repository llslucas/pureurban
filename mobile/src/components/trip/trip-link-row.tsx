import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Text } from 'react-native-paper'

import { MdiIcon, type MdiIconName } from '@/components/ui/mdi-icon'
import { lightPalette } from '@/lib/palette'
import { elevation, radius, spacing, typography } from '@/lib/tokens'

interface TripLinkRowProps {
  label: string
  icon: MdiIconName
  onPress: () => void
  disabled?: boolean
  testID?: string
}

export function TripLinkRow({ label, icon, onPress, disabled = false, testID = 'trip-link-row' }: TripLinkRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
      testID={testID}
    >
      <MdiIcon name={icon} size={24} color={lightPalette.text} />
      <Text style={styles.label}>{label}</Text>
      <MdiIcon name="chevron-right" size={24} color={lightPalette.textMuted} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    ...elevation.level1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: spacing.actionHeight,
    paddingHorizontal: spacing[4],
    gap: spacing[3],
    borderRadius: radius.lg,
  },
  pressed: {
    backgroundColor: lightPalette.surfaceSoft,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...typography.bodyLg,
    fontFamily: typography.label.fontFamily,
    fontWeight: typography.label.fontWeight,
    color: lightPalette.text,
    flex: 1,
  },
})

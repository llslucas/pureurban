import React from 'react'
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from 'react-native-paper'

import { MdiIcon, type MdiIconName } from '@/components/ui/mdi-icon'
import { PrimaryAction } from '@/components/ui/primary-action'
import { lightPalette } from '@/lib/palette'
import { elevation, radius, spacing, typography } from '@/lib/tokens'

export interface PermissionCardProps {
  icon: MdiIconName
  title: string
  description: string
  actionLabel: string
  actionIcon?: MdiIconName
  onPress: () => void
  variant?: 'primary' | 'secondary'
  /** Error line under the action, e.g. when the prompt or the settings failed to open. */
  note?: string | null
  style?: StyleProp<ViewStyle>
  testID?: string
  actionTestID?: string
}

const ICON_SIZE = 40

export function PermissionCard({
  icon,
  title,
  description,
  actionLabel,
  actionIcon,
  onPress,
  variant = 'primary',
  note,
  style,
  testID = 'permission-card',
  actionTestID = `${testID}-action`,
}: PermissionCardProps) {
  return (
    <View style={[styles.card, style]} testID={testID}>
      <MdiIcon name={icon} size={ICON_SIZE} color={lightPalette.text} testID={`${testID}-icon`} />
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.body}>{description}</Text>
      <PrimaryAction
        variant={variant}
        label={actionLabel}
        icon={actionIcon}
        onPress={onPress}
        testID={actionTestID}
      />
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    ...elevation.level1,
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[3],
  },
  title: {
    ...typography.title,
    color: lightPalette.text,
  },
  body: {
    ...typography.bodyLg,
    color: lightPalette.textBody,
  },
  note: {
    ...typography.bodyLg,
    color: lightPalette.error,
  },
})

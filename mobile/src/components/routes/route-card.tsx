import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { MdiIcon } from '@/components/ui/mdi-icon'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
import { radius, spacing, typography } from '@/lib/tokens'
import type { AssignedRoute } from '@/services/routes.service'

export interface RouteCardProps {
  route: Pick<AssignedRoute, 'name' | 'originCity' | 'destinationCity' | 'description'>
  testID?: string
}

const ARROW_SIZE = 20

export function routeAccessibilityLabel({
  name,
  originCity,
  destinationCity,
  description,
}: RouteCardProps['route']): string {
  const base = `${name}, de ${originCity} para ${destinationCity}`
  // The card is a single accessible node, so the description has to ride on
  // the label or a screen reader never reaches it.
  return description ? `${base}. ${description}` : base
}

export function RouteCard({ route, testID = 'route-card' }: RouteCardProps) {
  const { palette } = useAppTheme().custom
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.card} testID={testID} accessible accessibilityLabel={routeAccessibilityLabel(route)}>
      <Text style={styles.name} numberOfLines={2}>
        {route.name}
      </Text>
      <View style={styles.path} testID={`${testID}-path`}>
        <Text style={styles.city}>{route.originCity}</Text>
        <MdiIcon name="arrow-right" size={ARROW_SIZE} color={palette.textMuted} testID={`${testID}-arrow`} />
        <Text style={styles.city}>{route.destinationCity}</Text>
      </View>
      {route.description ? (
        <Text style={styles.description} numberOfLines={3} testID={`${testID}-description`}>
          {route.description}
        </Text>
      ) : null}
    </View>
  )
}

const createStyles = ({ custom: { palette, elevation } }: AppTheme) =>
  StyleSheet.create({
    card: {
      ...elevation.level1,
      backgroundColor: palette.surface,
      borderRadius: radius.lg,
      padding: spacing[4],
      gap: spacing[2],
    },
    name: {
      ...typography.title,
      color: palette.text,
    },
    // Wraps so long city names break onto a second line instead of truncating.
    path: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing[2],
    },
    city: {
      ...typography.bodyLg,
      color: palette.textBody,
    },
    description: {
      ...typography.body,
      color: palette.textMuted,
    },
  })

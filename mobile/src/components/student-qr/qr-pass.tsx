import React, { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator, Text } from 'react-native-paper'

import { StudentQrCode } from '@/components/student-qr-code'
import { MdiIcon, type MdiIconName } from '@/components/ui/mdi-icon'
import { lightPalette } from '@/lib/palette'
import { lightElevation, radius, spacing, typography } from '@/lib/tokens'

export interface QrPassProps {
  name: string
  /** Route line(s) under the name, built by the screen from the query state. */
  route: ReactNode
  qrValue: string
  testID?: string
}

const HEADER_ICON_SIZE = 32
const LINE_ICON_SIZE = 18
const FOOTER_ICON_SIZE = 20

export function QrPass({ name, route, qrValue, testID = 'qr-pass' }: QrPassProps) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header} testID={`${testID}-header`}>
        <View style={styles.nameRow}>
          <MdiIcon
            name="bus-school"
            size={HEADER_ICON_SIZE}
            color={lightPalette.onBrand}
            testID={`${testID}-icon`}
          />
          <Text style={styles.name} accessibilityRole="header">
            {name}
          </Text>
        </View>
        <View style={styles.routeLines}>{route}</View>
      </View>

      <View style={styles.body} testID={`${testID}-body`}>
        {/* Grouped so a screen reader announces the code once instead of
            walking the SVG; the footer below stays readable on its own. */}
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="QR code de embarque"
          testID={`${testID}-qr`}
        >
          <StudentQrCode value={qrValue} />
        </View>
        <View style={styles.footer}>
          <MdiIcon name="cellphone-screenshot" size={FOOTER_ICON_SIZE} color={lightPalette.textMuted} />
          <Text style={styles.footerText}>Mostre ao motorista</Text>
        </View>
      </View>
    </View>
  )
}

export interface QrPassRouteLineProps {
  text: string
  icon?: MdiIconName
  loading?: boolean
  /** Smaller type for the notes under the route ("+N rotas", stale data). */
  secondary?: boolean
  testID?: string
}

export function QrPassRouteLine({
  text,
  icon,
  loading,
  secondary,
  testID = 'qr-pass-route-line',
}: QrPassRouteLineProps) {
  const bare = !loading && !icon
  return (
    <View style={[styles.line, bare && styles.lineIndented]} testID={testID}>
      {loading ? (
        <ActivityIndicator size="small" color={lightPalette.onBrand} testID={`${testID}-spinner`} />
      ) : icon ? (
        <MdiIcon name={icon} size={LINE_ICON_SIZE} color={lightPalette.onBrand} testID={`${testID}-icon`} />
      ) : null}
      <Text style={secondary ? styles.lineSecondary : styles.linePrimary}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    ...lightElevation.level1,
    width: '100%',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: lightPalette.brand,
    padding: spacing[4],
    gap: spacing[2],
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  name: {
    ...typography.titleLg,
    color: lightPalette.onBrand,
    flexShrink: 1,
  },
  routeLines: {
    gap: spacing[1],
  },
  // Must stay pure canvas white: it continues the QR's quiet zone.
  body: {
    backgroundColor: lightPalette.canvas,
    padding: spacing[4],
    alignItems: 'center',
    gap: spacing[3],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  footerText: {
    ...typography.body,
    color: lightPalette.textMuted,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  // An icon-less note lines up with the text of the line above it.
  lineIndented: {
    paddingLeft: LINE_ICON_SIZE + spacing[2],
  },
  linePrimary: {
    ...typography.body,
    color: lightPalette.onBrand,
    flexShrink: 1,
  },
  lineSecondary: {
    ...typography.caption,
    color: lightPalette.onBrand,
    flexShrink: 1,
  },
})

import { router } from 'expo-router'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Text } from 'react-native-paper'

import { MdiIcon } from '@/components/ui/mdi-icon'
import { lightPalette, withAlpha } from '@/lib/palette'
import { radius, spacing, typography } from '@/lib/tokens'
import type { TripBoardedCount } from '@/utils/trip-boarded-count'

interface ScanHudProps {
  /** Trip-wide count (cached roster + optimistic); undefined while unknown. */
  count: TripBoardedCount | undefined
  /** Check-ins accepted on this screen since it mounted. */
  sessionCount: number
}

const MAX_FONT_SCALE = 1.5

export function ScanHud({ count, sessionCount }: ScanHudProps) {
  // Number and "embarcados" are separate Texts and the label avoids "X de Y
  // embarcados": the trip and list screens stay mounted in the same stack with
  // those exact strings, and Playwright's strict mode would match both.
  const a11yLabel = count
    ? `${count.boarded} ${count.boarded === 1 ? 'embarcado' : 'embarcados'} de ${count.total} na viagem`
    : 'Contagem de embarque indisponível'

  return (
    // `box-none`: the bar lets touches through to the camera behind it, but the
    // "Ver lista" button inside it still takes them.
    <View style={styles.bar} pointerEvents="box-none" testID="scan-hud">
      <View style={styles.counter}>
        <View style={styles.countRow} accessible accessibilityLabel={a11yLabel} testID="scan-hud-count">
          <Text style={styles.count} maxFontSizeMultiplier={MAX_FONT_SCALE} testID="scan-hud-count-value">
            {count ? (
              <>
                {count.boarded}
                <Text style={styles.count} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  /{count.total}
                </Text>
              </>
            ) : (
              '—'
            )}
          </Text>
          <Text style={styles.caption}>embarcados</Text>
        </View>
        <Text style={styles.session}>
          {sessionCount === 1 ? '1 embarque nesta sessão' : `${sessionCount} embarques nesta sessão`}
        </Text>
      </View>
      {/* `navigate`, never `push`: two quick taps used to stack two screens
          (3.2b finding). */}
      <Button
        mode="contained"
        buttonColor={withAlpha(lightPalette.onPrimary, 0.16)}
        textColor={lightPalette.onPrimary}
        icon={({ color }) => <MdiIcon name="format-list-bulleted" size={22} color={color} />}
        onPress={() => router.navigate('/(driver)/student-list')}
        style={styles.listButton}
        contentStyle={styles.listButtonContent}
        labelStyle={styles.listButtonLabel}
        testID="scan-hud-list"
      >
        Ver lista
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing.gutter,
    // Scrim over the camera: camera chrome (palette guard allowlist).
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  counter: {
    flex: 1,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: spacing[2],
  },
  count: {
    ...typography.headline,
    color: lightPalette.onPrimary,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    ...typography.bodyLg,
    color: lightPalette.onPrimary,
  },
  session: {
    ...typography.bodyLg,
    color: lightPalette.onPrimary,
  },
  listButton: {
    borderRadius: radius.md,
  },
  listButtonContent: {
    minHeight: spacing.touchMin,
  },
  listButtonLabel: {
    ...typography.button,
  },
})

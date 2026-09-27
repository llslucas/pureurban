import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { MdiIcon, type MdiIconName } from '@/components/ui/mdi-icon'
import { PrimaryAction } from '@/components/ui/primary-action'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
import { spacing, typography } from '@/lib/tokens'
import type { OfflineSyncState } from '@/hooks/use-offline-sync'

// One GLOBAL banner for the app (story 3.4b). Per-item badges and a queue cap
// counter were cut to Phase 2 on 2026-08-28: a driver at the wheel needs one
// signal, not an inventory.
const ICON_SIZE = 22

function pendingLabel(count: number): string {
  // The NFR13 text is literal and never varies with the count; the number is a
  // suffix so the driver can tell whether the queue is moving.
  const suffix = count === 1 ? '1 embarque na fila' : `${count} embarques na fila`
  return `Modo Offline — dados serão sincronizados (${suffix})`
}

function failedLabel(count: number): string {
  return count === 1
    ? '1 embarque não pôde ser enviado. Registre manualmente.'
    : `${count} embarques não puderam ser enviados. Registre manualmente.`
}

interface OfflineBannerProps extends OfflineSyncState {
  /** Bottom safe-area inset: the banner is the last thing on screen. */
  insetBottom?: number
  /**
   * D1/AC6: explicit acknowledgement. Without it the red strip would stay
   * forever, since a definitive failure's `failedCount` never drops on its own.
   */
  onDismissFailed?: () => void
}

function StripMessage({ icon, text, testID }: { icon: MdiIconName; text: string; testID: string }) {
  const { palette } = useAppTheme().custom
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.message}>
      <MdiIcon name={icon} size={ICON_SIZE} color={palette.onPrimary} testID={testID} />
      <Text style={styles.text} accessibilityRole="alert">
        {text}
      </Text>
    </View>
  )
}

export function OfflineBanner({
  pendingCount,
  failedCount,
  insetBottom = 0,
  onDismissFailed,
}: OfflineBannerProps) {
  const { palette } = useAppTheme().custom
  const styles = useThemedStyles(createStyles)
  // Nothing to show: drop the safe-area padding too, or an empty strip would
  // sit at the bottom.
  if (pendingCount === 0 && failedCount === 0) return null

  return (
    <View
      style={[styles.container, { paddingBottom: insetBottom }]}
      // The live region announces the strips on Android. `alert` lives on the
      // texts, not here: `accessible` on the container would flatten the subtree
      // into one element and make "Dispensar" unreachable on VoiceOver.
      accessibilityLiveRegion="polite"
    >
      {failedCount > 0 ? (
        // The failure comes first: it is the only one that needs the driver to act.
        <View style={[styles.strip, { backgroundColor: palette.error }]} testID="offline-banner-failed">
          <StripMessage icon="alert-circle-outline" text={failedLabel(failedCount)} testID="offline-banner-failed-icon" />
          {onDismissFailed ? (
            <View style={styles.dismiss}>
              <PrimaryAction
                variant="quiet"
                color={palette.onPrimary}
                label="Dispensar"
                onPress={onDismissFailed}
                testID="offline-banner-dismiss"
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {pendingCount > 0 ? (
        <View style={[styles.strip, { backgroundColor: palette.textBody }]} testID="offline-banner-pending">
          <StripMessage icon="cloud-off-outline" text={pendingLabel(pendingCount)} testID="offline-banner-pending-icon" />
        </View>
      ) : null}
    </View>
  )
}

const createStyles = ({ custom: { palette } }: AppTheme) =>
  StyleSheet.create({
    // In the flow rather than overlaid: as an overlay it would cover the scan
    // result overlay's buttons in the bottom half of the screen.
    container: {
      alignSelf: 'stretch',
    },
    strip: {
      paddingVertical: spacing[3],
      paddingHorizontal: spacing.gutter,
      gap: spacing[1],
    },
    message: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[3],
    },
    // NFR18: high contrast and >= 16sp, readable on the move and in direct sun.
    text: {
      ...typography.bodyLg,
      fontFamily: typography.button.fontFamily,
      fontWeight: typography.button.fontWeight,
      color: palette.onPrimary,
      flexShrink: 1,
    },
    dismiss: {
      alignSelf: 'flex-end',
    },
  })

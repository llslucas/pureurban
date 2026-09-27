import React from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { type AppTheme, useThemedStyles } from '@/lib/theme'
import { radius, spacing, typography } from '@/lib/tokens'

// Loading placeholders shaped like each screen's final content (EXPERIENCE.md →
// State Patterns). Block heights follow the line height of the text they stand in for.

export interface ScreenSkeletonProps {
  label: string
  testID?: string
}

const CHIP_HEIGHT = 32
const CHIP_WIDTH = 112
const COUNT_HEIGHT = typography.displayCount.lineHeight
const BAR_HEIGHT = 8
const STUDENT_ROWS = 6
const ROW_MIN_HEIGHT = 64
const AVATAR_SIZE = 40
const STATE_ICON_CIRCLE = 88
const RADIO_SIZE = 24
const SCAN_WINDOW_RATIO = 0.7

function CounterSkeleton() {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.counter}>
      <Skeleton height={COUNT_HEIGHT} width="45%" />
      <Skeleton height={BAR_HEIGHT} borderRadius={radius.full} />
    </View>
  )
}

export function TripCardSkeleton({ label, testID = 'trip-skeleton' }: ScreenSkeletonProps) {
  const styles = useThemedStyles(createStyles)
  return (
    <SkeletonGroup label={label} testID={testID} style={styles.card}>
      <Skeleton height={typography.overline.lineHeight} width="35%" />
      <View style={styles.headerRow}>
        <Skeleton height={typography.titleLg.lineHeight} width="55%" />
        <Skeleton height={CHIP_HEIGHT} width={CHIP_WIDTH} borderRadius={radius.full} />
      </View>
      <CounterSkeleton />
      <Skeleton height={typography.bodyLg.lineHeight} width="45%" />
    </SkeletonGroup>
  )
}

// The ready state of the no-trip section: the "Nenhuma viagem" block over a
// route picker, drawn with two 56dp options.
export function RouteSelectorSkeleton({ label, testID = 'route-selector-skeleton' }: ScreenSkeletonProps) {
  const styles = useThemedStyles(createStyles)
  return (
    <SkeletonGroup label={label} testID={testID} style={styles.routeRoot}>
      <View style={styles.stateBlock}>
        <Skeleton height={STATE_ICON_CIRCLE} width={STATE_ICON_CIRCLE} borderRadius={radius.full} />
        <Skeleton height={typography.titleLg.lineHeight} width="70%" />
        <Skeleton height={typography.bodyLg.lineHeight} width="50%" />
      </View>
      <View style={styles.selector}>
        <Skeleton height={typography.label.lineHeight} width="55%" />
        <View style={styles.list}>
          {[0, 1].map((index) => (
            <View key={index} style={[styles.option, index > 0 && styles.divider]}>
              <Skeleton height={RADIO_SIZE} width={RADIO_SIZE} borderRadius={radius.full} />
              <Skeleton height={typography.bodyLg.lineHeight} width="60%" />
            </View>
          ))}
        </View>
      </View>
    </SkeletonGroup>
  )
}

export function StudentListSkeleton({ label, testID = 'student-list-skeleton' }: ScreenSkeletonProps) {
  const styles = useThemedStyles(createStyles)
  return (
    <SkeletonGroup label={label} testID={testID} style={styles.listRoot}>
      <View style={styles.rosterHeader}>
        <CounterSkeleton />
        <Skeleton height={typography.body.lineHeight} width="80%" />
      </View>
      {Array.from({ length: STUDENT_ROWS }, (_, index) => (
        <View key={index} style={styles.row} testID={`${testID}-row`}>
          <Skeleton height={AVATAR_SIZE} width={AVATAR_SIZE} borderRadius={radius.full} />
          <View style={styles.rowBody}>
            <View style={styles.rowInfo}>
              <Skeleton height={typography.title.lineHeight} width="70%" />
              <Skeleton height={typography.caption.lineHeight} width="35%" />
            </View>
            <Skeleton height={CHIP_HEIGHT} width={CHIP_WIDTH} borderRadius={radius.full} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  )
}

export function BusEtaCardSkeleton({ label, testID = 'bus-eta-card-skeleton' }: ScreenSkeletonProps) {
  const styles = useThemedStyles(createStyles)
  return (
    <SkeletonGroup label={label} testID={testID} style={[styles.card, styles.etaCard]}>
      <View style={styles.headerRow}>
        <Skeleton height={typography.label.lineHeight} width="45%" />
        <Skeleton height={CHIP_HEIGHT} width={CHIP_WIDTH} borderRadius={radius.full} />
      </View>
      <Skeleton height={COUNT_HEIGHT} width="40%" />
      <Skeleton height={typography.title.lineHeight} width="50%" />
      <Skeleton height={typography.caption.lineHeight} width="70%" />
    </SkeletonGroup>
  )
}

// The HUD strip over a square window the size ScanFrame draws.
export function ScanSkeleton({ label, testID = 'scan-skeleton' }: ScreenSkeletonProps) {
  const styles = useThemedStyles(createStyles)
  const { width, height } = useWindowDimensions()
  const windowSize = Math.min(width, height) * SCAN_WINDOW_RATIO

  return (
    <SkeletonGroup label={label} testID={testID} style={styles.scanRoot}>
      <View style={styles.hud}>
        <Skeleton height={typography.headline.lineHeight} width="35%" />
        <Skeleton height={spacing.touchMin} width={CHIP_WIDTH} borderRadius={radius.md} />
      </View>
      <View style={styles.scanBody}>
        <Skeleton height={windowSize} width={windowSize} borderRadius={radius.lg} />
        <Skeleton height={typography.bodyLg.lineHeight} width="60%" />
      </View>
    </SkeletonGroup>
  )
}

const createStyles = ({ custom: { palette, elevation } }: AppTheme) =>
  StyleSheet.create({
    card: {
      ...elevation.level1,
      borderRadius: radius.lg,
      padding: spacing[4],
      gap: spacing[3],
    },
    etaCard: {
      gap: spacing[2],
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing[2],
    },
    counter: {
      gap: spacing[2],
    },
    routeRoot: {
      flexGrow: 1,
      gap: spacing.sectionGap,
    },
    stateBlock: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[3],
      padding: spacing.sectionGap,
    },
    selector: {
      gap: spacing[2],
    },
    list: {
      ...elevation.level1,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: spacing.actionHeight,
      paddingHorizontal: spacing[4],
      gap: spacing[3],
    },
    divider: {
      borderTopWidth: 1,
      borderTopColor: palette.hairline,
    },
    listRoot: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: palette.surfaceSoft,
    },
    rosterHeader: {
      gap: spacing[2],
      paddingHorizontal: spacing.gutter,
      paddingTop: spacing[4],
      paddingBottom: spacing[3],
      backgroundColor: palette.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.hairline,
    },
    row: {
      minHeight: ROW_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: spacing.gutter,
      gap: spacing.gutter,
      backgroundColor: palette.surface,
    },
    rowBody: {
      flex: 1,
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[3],
      paddingVertical: spacing[3],
      paddingRight: spacing.gutter,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.hairline,
    },
    rowInfo: {
      flex: 1,
      gap: spacing[1],
    },
    scanRoot: {
      flex: 1,
      backgroundColor: palette.surfaceSoft,
    },
    hud: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing[3],
      paddingVertical: spacing[3],
      paddingHorizontal: spacing.gutter,
      backgroundColor: palette.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.hairline,
    },
    scanBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[5],
      padding: spacing.gutter,
    },
  })

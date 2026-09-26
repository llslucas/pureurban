import React, { useLayoutEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { StatusChip } from '@/components/ui/status-chip'
import { STATUS_PRESENTATION } from '@/lib/boarding-status'
import { lightPalette } from '@/lib/palette'
import { motion, radius, spacing, typography } from '@/lib/tokens'
import type { TripStudentItem } from '@/services/trip.service'

const ROW_MIN_HEIGHT = 64
const AVATAR_SIZE = 40
// The avatar is a fixed 40dp circle: initials may grow a little with the system font, not overflow it.
const INITIALS_MAX_FONT_SCALE = 1.3
// The flex basis the name claims before the chip wraps below it: at large font
// scales the chip drops to its own line instead of squeezing the name to nothing.
const NAME_MIN_WIDTH = 96

export function initialsOf(name: string): string {
  const words = name.normalize('NFC').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = Array.from(words[0])[0]
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : ''
  return `${first}${last}`.toLocaleUpperCase('pt-BR')
}

function formatCheckedInAt(iso: string): string {
  // ISO 8601 UTC from the API, converted to local time only here. An unparseable
  // date (old contract in the cache, server garbage) must not show "Invalid Date".
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

interface StudentRowProps {
  student: TripStudentItem
  testID?: string
}

function StudentRowComponent({ student, testID = 'student-row' }: StudentRowProps) {
  const reducedMotion = useReducedMotion()
  // A status from an older contract rehydrated from the cache, or a future one,
  // must not take down the whole FlatList.
  const presentation = STATUS_PRESENTATION[student.status] ?? STATUS_PRESENTATION.NOT_CHECKED_IN

  const pulse = useSharedValue(0)
  const chipOpacity = useSharedValue(1)
  // The FlatList keys rows by studentId, so this is always the same student:
  // any status change while mounted (SSE or refetch) pulses; the first render doesn't.
  const previousStatus = useRef(student.status)

  // Layout effect: the new chip must not paint at full opacity for a frame before the fade starts.
  useLayoutEffect(() => {
    if (previousStatus.current === student.status) return
    previousStatus.current = student.status
    if (reducedMotion) {
      chipOpacity.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration: motion.reduced }),
      )
      return
    }
    pulse.value = withSequence(
      withTiming(1, { duration: 0 }),
      withTiming(0, { duration: motion.pulse }),
    )
    chipOpacity.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: motion.standard }),
    )
  }, [student.status, reducedMotion, pulse, chipOpacity])

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }))
  const chipStyle = useAnimatedStyle(() => ({ opacity: chipOpacity.value }))

  const time =
    student.status === 'CHECKED_IN' && student.checkedInAt
      ? formatCheckedInAt(student.checkedInAt)
      : ''

  // One announcement for the screen reader instead of loose fragments.
  const accessibilityLabel = time
    ? `${student.name}, ${presentation.label} às ${time}`
    : `${student.name}, ${presentation.label}`

  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel} testID={testID}>
      {/* A sibling behind the content, never an ancestor of the chip: the chip
          stays the nearest colored surface under its label. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: presentation.background }, pulseStyle]}
        testID={`${testID}-pulse`}
      />
      <View style={styles.avatar} testID={`${testID}-avatar`}>
        <Text style={styles.initials} numberOfLines={1} maxFontSizeMultiplier={INITIALS_MAX_FONT_SCALE}>
          {initialsOf(student.name)}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">
            {student.name}
          </Text>
          {time ? <Text style={styles.time}>{time}</Text> : null}
        </View>
        <Animated.View style={[styles.chipSlot, chipStyle]}>
          <StatusChip status={student.status} testID={`${testID}-chip`} />
        </Animated.View>
      </View>
    </View>
  )
}

// SSE events swap only the affected student's object, so the other rows skip re-rendering.
export const StudentRow = React.memo(StudentRowComponent)

const styles = StyleSheet.create({
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.gutter,
    gap: spacing.gutter,
    backgroundColor: lightPalette.surface,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightPalette.surfaceStrong,
  },
  initials: {
    ...typography.label,
    color: lightPalette.text,
  },
  // The divider lives on the body, not the row: gutter + avatar + gap = the 72dp inset.
  body: {
    flex: 1,
    alignSelf: 'stretch',
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing[3],
    rowGap: spacing[2],
    paddingVertical: spacing[3],
    paddingRight: spacing.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightPalette.hairline,
  },
  info: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: NAME_MIN_WIDTH,
    gap: spacing[1] / 2,
  },
  name: {
    ...typography.title,
    color: lightPalette.text,
  },
  time: {
    ...typography.caption,
    color: lightPalette.textMuted,
  },
  chipSlot: {
    maxWidth: '100%',
  },
})

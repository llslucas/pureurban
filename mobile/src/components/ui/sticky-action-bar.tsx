import React, { type ReactNode, useEffect, useState } from 'react'
import { Keyboard, Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { elevation, spacing } from '@/lib/tokens'

export interface StickyActionBarProps {
  /** One or two PrimaryActions; the primary goes last, closest to the thumb. */
  children: ReactNode
  testID?: string
}

// iOS fires "will" events before the keyboard animates; Android only has "did".
const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

export function StickyActionBar({ children, testID = 'sticky-action-bar' }: StickyActionBarProps) {
  const insets = useSafeAreaInsets()
  const [keyboardOpen, setKeyboardOpen] = useState(() => Keyboard.isVisible())

  useEffect(() => {
    const show = Keyboard.addListener(SHOW_EVENT, () => setKeyboardOpen(true))
    const hide = Keyboard.addListener(HIDE_EVENT, () => setKeyboardOpen(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  // A bar riding on top of the keyboard would cover the field being typed in.
  if (keyboardOpen) return null

  return (
    <View style={[styles.bar, { paddingBottom: spacing[4] + insets.bottom }]} testID={testID}>
      <View style={styles.stack}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    ...elevation.level2,
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
  },
  stack: {
    width: '100%',
    maxWidth: spacing.contentMaxWidth,
    alignSelf: 'center',
    gap: spacing[3],
  },
})

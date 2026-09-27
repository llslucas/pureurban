import React, { type ReactElement, type ReactNode } from 'react'
import { type RefreshControlProps, ScrollView, StyleSheet, View } from 'react-native'
import { type Edge, SafeAreaView } from 'react-native-safe-area-context'

import { type AppTheme, useThemedStyles } from '@/lib/theme'
import { spacing } from '@/lib/tokens'

export interface ScreenProps {
  variant?: 'scroll' | 'fixed'
  children: ReactNode
  /** Usually a StickyActionBar; it pads the bottom inset itself. */
  footer?: ReactNode
  refreshControl?: ReactElement<RefreshControlProps>
  testID?: string
}

export function Screen({ variant = 'fixed', children, footer, refreshControl, testID = 'screen' }: ScreenProps) {
  const styles = useThemedStyles(createStyles)
  // No top edge: the native stack header already clears the status bar. The
  // bottom edge belongs to the footer when there is one.
  const edges: Edge[] = footer ? ['left', 'right'] : ['left', 'right', 'bottom']

  return (
    <SafeAreaView style={styles.root} edges={edges} testID={testID}>
      {variant === 'scroll' ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[styles.content, styles.scrollContent]}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
          testID={`${testID}-scroll`}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.content]} testID={`${testID}-content`}>
          {children}
        </View>
      )}
      {footer}
    </SafeAreaView>
  )
}

const createStyles = ({ custom: { palette } }: AppTheme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.surfaceSoft,
    },
    fill: {
      flex: 1,
    },
    content: {
      width: '100%',
      maxWidth: spacing.contentMaxWidth,
      alignSelf: 'center',
      padding: spacing.gutter,
    },
    scrollContent: {
      flexGrow: 1,
    },
  })

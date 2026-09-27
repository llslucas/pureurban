import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { MdiIcon } from '@/components/ui/mdi-icon'
import { Screen } from '@/components/ui/screen'
import { StateView } from '@/components/ui/state-view'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
import { spacing, typography } from '@/lib/tokens'
import { useAuthStore } from '@/stores/auth.store'

const BRAND_ICON_SIZE = 40

export default function AdminHome() {
  const { palette } = useAppTheme().custom
  const styles = useThemedStyles(createStyles)
  const logout = useAuthStore((state) => state.logout)

  return (
    <View style={styles.root} testID="admin-home">
      <View style={styles.brand} testID="admin-brand">
        <MdiIcon name="bus-school" size={BRAND_ICON_SIZE} color={palette.onBrand} />
        <Text style={styles.wordmark} accessibilityRole="header">
          PureUrban
        </Text>
      </View>
      <Screen testID="admin-screen">
        <StateView
          kind="empty"
          icon="tools"
          title="Em breve"
          detail="O painel administrativo ainda está em construção."
          action={{ label: 'Sair', icon: 'logout', onPress: logout }}
          testID="admin-soon"
        />
      </Screen>
    </View>
  )
}

const createStyles = ({ custom: { palette } }: AppTheme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.surfaceSoft,
    },
    brand: {
      backgroundColor: palette.brand,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sectionGap,
      paddingHorizontal: spacing.gutter,
    },
    wordmark: {
      ...typography.headline,
      color: palette.onBrand,
      marginTop: spacing[2],
    },
  })

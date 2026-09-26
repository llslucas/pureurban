import type { NativeStackNavigationOptions } from '@react-navigation/native-stack'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { lightPalette } from '@/lib/palette'
import { typography } from '@/lib/tokens'

function HeaderBackground() {
  return <View style={styles.background} />
}

// AppHeader (DESIGN.md): shared `screenOptions` for the (driver) and (student)
// stacks. native-stack's `headerStyle` only takes `backgroundColor`, so the
// hairline divider has to come from a custom background. No `headerRight` here:
// each layout wires its own AccountMenu, so the driver can't silently lose the
// pending-queue count that gates the logout warning.
export const appHeaderOptions: NativeStackNavigationOptions = {
  headerShadowVisible: false,
  headerBackground: HeaderBackground,
  headerTintColor: lightPalette.text,
  headerTitleStyle: {
    fontFamily: typography.title.fontFamily,
    fontSize: typography.title.fontSize,
    fontWeight: typography.title.fontWeight,
  },
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: lightPalette.canvas,
    borderBottomWidth: 1,
    borderBottomColor: lightPalette.hairline,
  },
})

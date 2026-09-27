import { router } from 'expo-router'
import React, { useState } from 'react'
import { StyleSheet } from 'react-native'
import { IconButton, Menu } from 'react-native-paper'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
import { spacing, typography } from '@/lib/tokens'
import { useAuthStore } from '@/stores/auth.store'

export interface AccountMenuProps {
  /** Check-ins still in the offline queue; logging out purges them (D5/AC7). */
  pendingCount?: number
}

function discardMessage(count: number): string {
  return count === 1
    ? '1 embarque ainda não foi enviado e será descartado.'
    : `${count} embarques ainda não foram enviados e serão descartados.`
}

export function AccountMenu({ pendingCount = 0 }: AccountMenuProps) {
  const { palette } = useAppTheme().custom
  const styles = useThemedStyles(createStyles)
  const logout = useAuthStore((state) => state.logout)
  const [menuVisible, setMenuVisible] = useState(false)
  // Frozen when the dialog opens: the drain may empty the queue meanwhile, and a
  // live count would turn the warning into "0 embarques ... serão descartados".
  const [confirmCount, setConfirmCount] = useState<number | null>(null)

  const signOut = () => {
    setConfirmCount(null)
    // Same order as scan/qr-code: dropping the session first is what lets the
    // `(auth)` group back into the tree before navigating to it.
    logout()
    router.replace('/(auth)/login')
  }

  const handleLogoutPress = () => {
    // The menu must close before the dialog opens, or both stay stacked.
    setMenuVisible(false)
    if (pendingCount > 0) {
      setConfirmCount(pendingCount)
    } else {
      signOut()
    }
  }

  return (
    <>
      <Menu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        anchor={
          <IconButton
            icon="dots-vertical"
            iconColor={palette.text}
            accessibilityLabel="Mais opções"
            onPress={() => setMenuVisible(true)}
            style={styles.anchor}
            testID="account-menu-button"
          />
        }
        anchorPosition="bottom"
        contentStyle={styles.menu}
      >
        <Menu.Item
          leadingIcon="logout"
          title="Sair"
          onPress={handleLogoutPress}
          titleStyle={styles.itemTitle}
          style={styles.item}
          testID="account-menu-logout"
        />
      </Menu>
      <ConfirmDialog
        visible={confirmCount !== null}
        title="Sair da conta?"
        message={discardMessage(confirmCount ?? pendingCount)}
        confirmLabel="Sair"
        destructive
        onConfirm={signOut}
        onDismiss={() => setConfirmCount(null)}
        testID="logout-confirm-dialog"
      />
    </>
  )
}

const createStyles = ({ custom: { palette } }: AppTheme) =>
  StyleSheet.create({
    anchor: {
      width: spacing.touchMin,
      height: spacing.touchMin,
      margin: 0,
    },
    menu: {
      backgroundColor: palette.canvas,
    },
    item: {
      minHeight: spacing.touchMin,
    },
    itemTitle: {
      ...typography.body,
      color: palette.text,
    },
  })

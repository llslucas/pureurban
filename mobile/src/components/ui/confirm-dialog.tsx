import React from 'react'
import { StyleSheet } from 'react-native'
import { Dialog, Portal, Text } from 'react-native-paper'

import { PrimaryAction } from '@/components/ui/primary-action'
import { lightPalette } from '@/lib/palette'
import { spacing, typography } from '@/lib/tokens'

export interface ConfirmDialogProps {
  visible: boolean
  title: string
  message: string
  /** Name it by the verb ("Encerrar viagem"), never a generic "OK". */
  confirmLabel: string
  onConfirm: () => void
  onDismiss: () => void
  destructive?: boolean
  loading?: boolean
  testID?: string
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onDismiss,
  destructive = false,
  loading = false,
  testID = 'confirm-dialog',
}: ConfirmDialogProps) {
  // While the request is in flight, backing out would leave its outcome unseen.
  const dismiss = loading ? () => {} : onDismiss

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={dismiss} dismissable={!loading} style={styles.dialog} testID={testID}>
        <Dialog.Title style={styles.title}>{title}</Dialog.Title>
        <Dialog.Content>
          <Text style={styles.message}>{message}</Text>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <PrimaryAction
            variant="quiet"
            label="Voltar"
            onPress={onDismiss}
            disabled={loading}
            testID={`${testID}-cancel`}
          />
          <PrimaryAction
            variant={destructive ? 'danger' : 'primary'}
            label={confirmLabel}
            onPress={onConfirm}
            loading={loading}
            impact={destructive}
            testID={`${testID}-confirm`}
          />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}

const styles = StyleSheet.create({
  dialog: {
    backgroundColor: lightPalette.canvas,
  },
  title: {
    ...typography.titleLg,
    color: lightPalette.text,
  },
  message: {
    ...typography.body,
    color: lightPalette.textBody,
  },
  actions: {
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
})

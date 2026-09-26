import React from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator, Text } from 'react-native-paper'

import { MdiIcon, type MdiIconName } from '@/components/ui/mdi-icon'
import { PrimaryAction } from '@/components/ui/primary-action'
import { lightPalette } from '@/lib/palette'
import { radius, spacing, typography } from '@/lib/tokens'

export type StateViewKind = 'loading' | 'empty' | 'error' | 'blocked'

export interface StateViewAction {
  label: string
  onPress: () => void
  icon?: MdiIconName
  loading?: boolean
}

export interface StateViewProps {
  kind: StateViewKind
  title: string
  detail?: string
  icon?: MdiIconName
  /** Extra line in error red, e.g. when the action itself failed. */
  note?: string | null
  action?: StateViewAction
  testID?: string
}

const DEFAULT_ICON: Record<Exclude<StateViewKind, 'loading'>, MdiIconName> = {
  error: 'cloud-alert',
  blocked: 'lock-outline',
  empty: 'information-outline',
}

const ICON_CIRCLE = 88
const ICON_SIZE = 48

export function StateView({ kind, title, detail, icon, note, action, testID = 'state-view' }: StateViewProps) {
  const isLoading = kind === 'loading'

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.column}>
        {isLoading ? (
          <ActivityIndicator size="large" color={lightPalette.primary} />
        ) : (
          <View
            style={styles.iconCircle}
            testID={`${testID}-icon`}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <MdiIcon name={icon ?? DEFAULT_ICON[kind]} size={ICON_SIZE} color={lightPalette.text} />
          </View>
        )}
        <Text
          style={isLoading ? styles.loadingTitle : styles.title}
          accessibilityRole={isLoading ? undefined : 'header'}
        >
          {title}
        </Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
        {action && !isLoading ? (
          <View style={styles.action}>
            <PrimaryAction
              label={action.label}
              onPress={action.onPress}
              icon={action.icon}
              loading={action.loading}
              testID={`${testID}-action`}
            />
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sectionGap,
    backgroundColor: lightPalette.surfaceSoft,
  },
  column: {
    width: '100%',
    maxWidth: spacing.contentMaxWidth,
    alignItems: 'center',
    gap: spacing[3],
  },
  iconCircle: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightPalette.surfaceStrong,
    marginBottom: spacing[1],
  },
  title: {
    ...typography.titleLg,
    color: lightPalette.text,
    textAlign: 'center',
  },
  // A spinner caption, not a headline: keeps the loading state quiet.
  loadingTitle: {
    ...typography.bodyLg,
    color: lightPalette.textMuted,
    textAlign: 'center',
  },
  detail: {
    ...typography.bodyLg,
    color: lightPalette.textMuted,
    textAlign: 'center',
  },
  note: {
    ...typography.bodyLg,
    fontFamily: typography.button.fontFamily,
    fontWeight: typography.button.fontWeight,
    color: lightPalette.error,
    textAlign: 'center',
  },
  action: {
    alignSelf: 'stretch',
    marginTop: spacing[3],
  },
})

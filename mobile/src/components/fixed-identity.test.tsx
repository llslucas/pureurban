import React, { type ReactElement } from 'react'
import { StyleSheet } from 'react-native'

import { ScanResultOverlay, type ScanResult } from '@/components/scan/scan-result-overlay'
import { QrPass, QrPassRouteLine } from '@/components/student-qr/qr-pass'
import { renderUi } from '@/components/ui/test-utils'
import { darkTheme, lightTheme } from '@/lib/theme'

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }))

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light' },
}))

jest.mock('react-native-qrcode-svg', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native')
  return function MockQrCode(props: { value: string }) {
    return <View testID="mock-qr" {...props} />
  }
})

const SUCCESS: ScanResult = {
  kind: 'success',
  title: 'Embarque confirmado',
  detail: 'Aluno registrado nesta viagem.',
  studentName: 'Ana Souza',
}

// Styles are flattened so a Paper default overridden by the component's own
// color (Text picks `onSurface` from the theme) compares by what renders.
function flattenStyles(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(flattenStyles)
  if (!node || typeof node !== 'object') return node
  const { props, children, ...rest } = node as { props?: Record<string, unknown>; children?: unknown }
  const style = props?.style ? StyleSheet.flatten(props.style as never) : undefined
  return { ...rest, props: { ...props, style }, children: flattenStyles(children) }
}

async function renderedTree(element: ReactElement, theme: typeof lightTheme) {
  const { toJSON, unmount } = await renderUi(element, theme)
  const tree = JSON.stringify(flattenStyles(toJSON()))
  unmount()
  return tree
}

// Camera chrome and the QR pass keep the light identity in both schemes: a white
// overlay over the camera at night is glare, and the pass is a brand surface.
describe('fixed-identity surfaces under the dark theme', () => {
  it.each<[string, () => ReactElement]>([
    ['QrPass', () => (
      <QrPass
        name="Ana Souza"
        qrValue='{"studentId":"s","sessionId":"x"}'
        route={<QrPassRouteLine icon="map-marker-path" text="Linha Centro" />}
      />
    )],
    ['ScanResultOverlay (checking)', () => (
      <ScanResultOverlay result={{ kind: 'checking' }} onResume={jest.fn()} onRetry={jest.fn()} autoResumeMs={2500} />
    )],
    ['ScanResultOverlay (success)', () => (
      <ScanResultOverlay result={SUCCESS} onResume={jest.fn()} onRetry={jest.fn()} autoResumeMs={2500} />
    )],
  ])('%s renders the same tree as in light', async (_name, element) => {
    const light = await renderedTree(element(), lightTheme)
    const dark = await renderedTree(element(), darkTheme)
    expect(dark).toBe(light)
  })
})

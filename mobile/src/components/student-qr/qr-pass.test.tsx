import { screen } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, StyleSheet } from 'react-native'

import { QrPass, QrPassRouteLine } from '@/components/student-qr/qr-pass'
import { MdiIcon } from '@/components/ui/mdi-icon'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { radius, typography } from '@/lib/tokens'

jest.mock('react-native-qrcode-svg', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native')
  return function MockQrCode(props: { value: string }) {
    return <View testID="mock-qr" {...props} />
  }
})

const hidden = { includeHiddenElements: true }

// The host node drops `name`/`size`/`color`; read them from the MdiIcon element
// that carries the testID.
function icon(testID: string): TestNode {
  const match = screen.UNSAFE_getAllByProps({ testID }).find((node) => node.type === MdiIcon)
  if (!match) throw new Error(`no MdiIcon with testID "${testID}"`)
  return match
}

function expectNoOpacity(text: string) {
  expect(StyleSheet.flatten(screen.getByText(text).props.style).opacity).toBeUndefined()
}

describe('QrPass', () => {
  beforeEach(async () => {
    await renderUi(
      <QrPass
        name="Ana Souza"
        qrValue='{"studentId":"s","sessionId":"x"}'
        route={<QrPassRouteLine icon="map-marker-path" text="Linha Centro" />}
      />,
    )
  })

  it('xl card with a hairline border and clipped corners', () => {
    const card = StyleSheet.flatten(screen.getByTestId('qr-pass').props.style)
    expect(card).toMatchObject({
      borderRadius: radius.xl,
      overflow: 'hidden',
      borderColor: lightPalette.hairline,
      borderWidth: 1,
    })
  })

  it('brand header with the school bus icon and the name in title-lg on-brand', () => {
    expect(StyleSheet.flatten(screen.getByTestId('qr-pass-header').props.style).backgroundColor).toBe(
      lightPalette.brand,
    )
    const busIcon = icon('qr-pass-icon')
    expect(busIcon.props.name).toBe('bus-school')
    expect(busIcon.props.size).toBe(32)
    expect(busIcon.props.color).toBe(lightPalette.onBrand)
    const name = StyleSheet.flatten(screen.getByText('Ana Souza').props.style)
    expect(name).toMatchObject({ fontSize: typography.titleLg.fontSize, color: lightPalette.onBrand })
    expect(screen.getByText('Linha Centro')).toBeTruthy()
  })

  it('white body holding the QR, labelled for screen readers, and the footer', () => {
    expect(StyleSheet.flatten(screen.getByTestId('qr-pass-body').props.style).backgroundColor).toBe(lightPalette.canvas)
    expect(screen.getByLabelText('QR code de embarque')).toBeTruthy()
    expect(screen.getByTestId('mock-qr', hidden).props.value).toBe('{"studentId":"s","sessionId":"x"}')
    const footer = StyleSheet.flatten(screen.getByText('Mostre ao motorista').props.style)
    expect(footer).toMatchObject({ fontSize: typography.body.fontSize, color: lightPalette.textMuted })
  })

  it('no text uses opacity', () => {
    for (const text of ['Ana Souza', 'Linha Centro', 'Mostre ao motorista']) expectNoOpacity(text)
  })
})

describe('QrPassRouteLine', () => {
  it('loading: small on-brand spinner, no icon', async () => {
    await renderUi(<QrPassRouteLine loading text="Carregando rota..." />)
    const spinner = screen.getByTestId('qr-pass-route-line-spinner', hidden)
    const onBrandArc = spinner.findAll(
      (node: TestNode) => StyleSheet.flatten(node.props.style)?.borderColor === lightPalette.onBrand,
    )
    expect(onBrandArc.length).toBeGreaterThan(0)
    expect(screen.queryByTestId('qr-pass-route-line-icon', hidden)).toBeNull()
    expectNoOpacity('Carregando rota...')
  })

  it('with icon: on-brand icon and body text', async () => {
    await renderUi(<QrPassRouteLine icon="map-marker-off" text="Nenhuma rota vinculada" />)
    const lineIcon = icon('qr-pass-route-line-icon')
    expect(lineIcon.props.name).toBe('map-marker-off')
    expect(lineIcon.props.color).toBe(lightPalette.onBrand)
    const text = StyleSheet.flatten(screen.getByText('Nenhuma rota vinculada').props.style)
    expect(text).toMatchObject({ fontSize: typography.body.fontSize, color: lightPalette.onBrand })
    expect(text.opacity).toBeUndefined()
  })

  it('secondary: caption type, still on-brand', async () => {
    await renderUi(<QrPassRouteLine secondary text="+2 rotas" />)
    const text = StyleSheet.flatten(screen.getByText('+2 rotas').props.style)
    expect(text).toMatchObject({ fontSize: typography.caption.fontSize, color: lightPalette.onBrand })
    expect(text.opacity).toBeUndefined()
  })
})

describe('QR size on a narrow screen', () => {
  afterEach(() => jest.restoreAllMocks())

  it('320dp wide: the QR shrinks to fit the pass chrome (320 - 66 = 254)', async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 1 })
    await renderUi(<QrPass name="Ana" qrValue="x" route={null} />)
    expect(screen.getByTestId('mock-qr', hidden).props.size).toBe(254)
  })
})

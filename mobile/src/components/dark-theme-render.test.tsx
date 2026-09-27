import { fireEvent, screen } from '@testing-library/react-native'
import React, { type ReactElement } from 'react'
import { StyleSheet } from 'react-native'

import { AccountMenu } from '@/components/account-menu'
import { RouteCard } from '@/components/routes/route-card'
import { CameraPermissionState, NoActiveTripState, RoleGuardState } from '@/components/scan/scan-blocked-states'
import { ShortcutCard } from '@/components/student-home/shortcut-card'
import { TripStatusCard } from '@/components/student-home/trip-status-card'
import { RosterHeader } from '@/components/student-list/roster-header'
import { BusEtaCard } from '@/components/track-bus/bus-eta-card'
import { ActiveTripActions } from '@/components/trip/active-trip-actions'
import { StartOutboundSection } from '@/components/trip/start-outbound-section'
import { TripCard } from '@/components/trip/trip-card'
import { TripLinkRow } from '@/components/trip/trip-link-row'
import { BoardingCounter } from '@/components/ui/boarding-counter'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CountdownPill } from '@/components/ui/countdown-pill'
import { PermissionCard } from '@/components/ui/permission-card'
import {
  BusEtaCardSkeleton,
  RouteSelectorSkeleton,
  ScanSkeleton,
  StudentListSkeleton,
  TripCardSkeleton,
} from '@/components/ui/screen-skeletons'
import { Skeleton } from '@/components/ui/skeleton'
import { StateView } from '@/components/ui/state-view'
import { StickyActionBar } from '@/components/ui/sticky-action-bar'
import { PrimaryAction } from '@/components/ui/primary-action'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { darkPalette, darkStatusTints, lightPalette, lightStatusTints } from '@/lib/palette'
import { darkTheme, lightTheme } from '@/lib/theme'
import { ELEVATION_BORDER_WIDTH } from '@/lib/tokens'
import type { AssignedRoute } from '@/services/routes.service'
import type { TripStudentItem } from '@/services/trip.service'
import { useAuthStore } from '@/stores/auth.store'

// Screens rendered without a provider fall back to the light theme, so before
// this suite no themed component had been rendered under `darkTheme` (R7b).

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), navigate: jest.fn() } }))
jest.mock('@/stores/auth.store', () => ({ useAuthStore: jest.fn() }))

beforeEach(() => {
  jest.mocked(useAuthStore).mockImplementation(((selector: (state: { logout: () => void }) => unknown) =>
    selector({ logout: jest.fn() })) as unknown as typeof useAuthStore)
})

const normalize = (color: string) => color.toLowerCase().replace(/\s+/g, '')

// Light roles with no counterpart in the dark palette: finding one of these in
// a dark render means the component pinned the light look.
const darkValues = new Set([...Object.values(darkPalette), ...Object.values(darkStatusTints)].map(normalize))
const LIGHT_ONLY = new Set(
  [...Object.values(lightPalette), ...Object.values(lightStatusTints)]
    .map(normalize)
    .filter((color) => !darkValues.has(color)),
)

const COLOR_KEYS = ['backgroundColor', 'color', 'borderColor', 'borderTopColor', 'borderBottomColor'] as const

type JsonNode = { type: string; props: Record<string, unknown>; children: (JsonNode | string)[] | null }

function lightOnlyColors(): string[] {
  const found: string[] = []
  const visit = (node: JsonNode | string | null) => {
    if (!node || typeof node === 'string') return
    const style = StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined
    for (const key of COLOR_KEYS) {
      const value = style?.[key]
      if (typeof value === 'string' && LIGHT_ONLY.has(normalize(value))) found.push(`${node.type}.${key} = ${value}`)
    }
    for (const prop of ['color', 'iconColor', 'tintColor'] as const) {
      const value = node.props[prop]
      if (typeof value === 'string' && LIGHT_ONLY.has(normalize(value))) found.push(`${node.type}[${prop}] = ${value}`)
    }
    node.children?.forEach(visit)
  }
  const tree = screen.toJSON() as JsonNode | JsonNode[] | null
  for (const root of Array.isArray(tree) ? tree : [tree]) visit(root)
  return found
}

const noop = () => {}
const ROUTE: AssignedRoute = {
  id: 'route-1',
  name: 'Linha Centro - Universidade',
  description: 'Saída às 18h',
  originCity: 'Centro',
  destinationCity: 'Campus',
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-01-10T08:00:00.000Z',
}
const STUDENTS: TripStudentItem[] = [
  { studentId: 's1', name: 'Ana Souza', status: 'CHECKED_IN', checkedInAt: '2026-09-27T21:00:00.000Z' },
  { studentId: 's2', name: 'Bia Lima', status: 'NOT_CHECKED_IN', checkedInAt: null },
  { studentId: 's3', name: 'Caio Reis', status: 'NOT_RETURNING', checkedInAt: null },
]

const CASES: [string, ReactElement][] = [
  ['AccountMenu', <AccountMenu key="menu" />],
  ['RosterHeader', <RosterHeader key="roster" summary={{ boarded: 1, total: 2 }} students={STUDENTS} />],
  ['ShortcutCard', <ShortcutCard key="shortcut" label="Meu QR" icon="qrcode" onPress={noop} />],
  [
    'ConfirmDialog',
    <ConfirmDialog key="dialog" visible title="Encerrar viagem?" message="Não dá para desfazer." confirmLabel="Encerrar" destructive onConfirm={noop} onDismiss={noop} />,
  ],
  ['BoardingCounter', <BoardingCounter key="counter" summary={{ boarded: 1, total: 2 }} />],
  ['TripCardSkeleton', <TripCardSkeleton key="s1" label="Carregando viagem..." />],
  ['RouteSelectorSkeleton', <RouteSelectorSkeleton key="s2" label="Carregando rotas..." />],
  ['StudentListSkeleton', <StudentListSkeleton key="s3" label="Carregando alunos..." />],
  ['BusEtaCardSkeleton', <BusEtaCardSkeleton key="s4" label="Carregando sua viagem..." />],
  ['ScanSkeleton', <ScanSkeleton key="s5" label="Carregando..." />],
  [
    'PermissionCard',
    <PermissionCard key="perm" icon="map-marker" title="Localização" description="Precisamos dela." actionLabel="Permitir acesso" onPress={noop} note="Falhou." />,
  ],
  ...(['loading', 'empty', 'error', 'blocked'] as const).map(
    (kind): [string, ReactElement] => [
      `StateView ${kind}`,
      <StateView key={kind} kind={kind} title="Título" detail="Detalhe" note="Nota" action={{ label: 'Tentar novamente', onPress: noop }} />,
    ],
  ),
  [
    'BusEtaCard live',
    <BusEtaCard key="eta" eta="5 min" distance="1,2 km" freshness={{ kind: 'live' }} caption="Última posição às 14:07" captionAccessibilityLabel="Última posição às 14:07" />,
  ],
  [
    'BusEtaCard stale',
    <BusEtaCard key="eta-stale" eta={null} distance={null} freshness={{ kind: 'stale', minutes: 3 }} caption="Última posição às 14:07" captionAccessibilityLabel="Última posição às 14:07" />,
  ],
  ['StickyActionBar', <StickyActionBar key="bar"><PrimaryAction label="Iniciar Viagem" onPress={noop} /></StickyActionBar>],
  [
    'TripStatusCard',
    <TripStatusCard key="status" stateKey="waiting" chip={{ label: 'Aguardando', icon: 'clock-outline', tone: 'neutral' }} title="Viagem de volta" detail="Detalhe" caption="Iniciada às 18:00" />,
  ],
  ...(['loading', 'error', 'no-routes', 'ready'] as const).map(
    (phase): [string, ReactElement] => [
      `StartOutboundSection ${phase}`,
      <StartOutboundSection key={phase} phase={phase} routes={phase === 'ready' ? [ROUTE, { ...ROUTE, id: 'route-2' }] : []} isFetching={false} onRetry={noop} selectedRouteId="route-1" onSelectRoute={noop} disabled={false} />,
    ],
  ),
  ['Skeleton', <Skeleton key="skeleton" height={16} />],
  ['TripLinkRow', <TripLinkRow key="link" label="Alunos da Viagem" icon="account-group" onPress={noop} />],
  [
    'TripCard active',
    <TripCard key="trip" type="OUTBOUND" status="ACTIVE" routeName={ROUTE.name} summary={{ boarded: 1, total: 2 }} startedAt="2026-09-27T12:00:00.000Z" />,
  ],
  [
    'TripCard completed',
    <TripCard key="trip-done" type="RETURN" status="COMPLETED" routeName={ROUTE.name} summary={{ boarded: 2, total: 2 }} startedAt="2026-09-27T12:00:00.000Z" />,
  ],
  ['RoleGuardState', <RoleGuardState key="role" logout={noop} />],
  ['CameraPermissionState', <CameraPermissionState key="camera" canAskAgain requestPermission={() => Promise.resolve()} />],
  ['NoActiveTripState', <NoActiveTripState key="no-trip" />],
  ['CountdownPill', <CountdownPill key="pill" remainingMs={90_000} label="Desfazer em" />],
  ['CountdownPill urgent', <CountdownPill key="pill-urgent" remainingMs={10_000} label="Desfazer em" />],
  ['ActiveTripActions', <ActiveTripActions key="actions" onEnd={noop} onScan={noop} disabled={false} />],
  ['RouteCard', <RouteCard key="route" route={ROUTE} />],
]

const hidden = { includeHiddenElements: true }

describe('themed components under darkTheme (R7b)', () => {
  it('the probe catches a light render (control)', async () => {
    await renderUi(<TripCard type="OUTBOUND" status="COMPLETED" routeName={ROUTE.name} summary={{ boarded: 2, total: 2 }} startedAt="2026-09-27T12:00:00.000Z" />, lightTheme)
    expect(lightOnlyColors().length).toBeGreaterThan(0)
  })

  it.each(CASES)('%s: no resolved color comes from the light palette alone', async (_, element) => {
    await renderUi(element, darkTheme)
    expect(lightOnlyColors()).toEqual([])
  })
})

describe('dark overlays stand out from the canvas (AI1)', () => {
  function styleOf(node: TestNode) {
    return StyleSheet.flatten(node.props.style) as Record<string, unknown>
  }

  // Walks up from a node to the first ancestor carrying a background.
  function surfaceAround(node: TestNode) {
    let current: TestNode | null = node
    while (current) {
      if (styleOf(current)?.backgroundColor) return styleOf(current)
      current = current.parent
    }
    return undefined
  }

  it('account menu: element surface with a hairline border', async () => {
    await renderUi(<AccountMenu />, darkTheme)
    fireEvent.press(screen.getByLabelText('Mais opções'))
    const menu = surfaceAround(await screen.findByText('Sair'))
    expect(menu).toMatchObject({
      backgroundColor: darkPalette.surface,
      borderColor: darkPalette.hairline,
      borderWidth: ELEVATION_BORDER_WIDTH,
    })
    expect(menu?.backgroundColor).not.toBe(darkPalette.canvas)
  })

  it('confirm dialog: element surface with a hairline border', async () => {
    await renderUi(
      <ConfirmDialog visible title="Sair da conta?" message="Mensagem" confirmLabel="Sair" onConfirm={noop} onDismiss={noop} />,
      darkTheme,
    )
    expect(surfaceAround(screen.getByText('Sair da conta?'))).toMatchObject({
      backgroundColor: darkPalette.surface,
      borderColor: darkPalette.hairline,
    })
  })

  it('sticky action bar: hairline top border replaces the invisible shadow', async () => {
    await renderUi(<StickyActionBar><PrimaryAction label="Iniciar Viagem" onPress={noop} /></StickyActionBar>, darkTheme)
    expect(styleOf(screen.getByTestId('sticky-action-bar'))).toMatchObject({
      borderTopColor: darkPalette.hairline,
      borderTopWidth: ELEVATION_BORDER_WIDTH,
    })
  })

  it('skeleton: the shimmer is lighter than the block, not darker', async () => {
    await renderUi(<Skeleton height={16} />, darkTheme)
    expect(styleOf(screen.getByTestId('skeleton', hidden)).backgroundColor).toBe(darkPalette.surfaceStrong)
    expect(styleOf(screen.getByTestId('skeleton-shimmer', hidden)).backgroundColor).toBe(darkPalette.borderStrong)
  })

  it('pressed link row takes the strong surface, not the canvas', async () => {
    await renderUi(<TripLinkRow label="Alunos da Viagem" icon="account-group" onPress={noop} />, darkTheme)
    // The host View gets the already-resolved style; the Pressable above it
    // still holds the style function.
    let node: TestNode | null = screen.getByTestId('trip-link-row')
    while (node && typeof node.props.style !== 'function') node = node.parent
    const styleFor = node!.props.style as (state: { pressed: boolean }) => unknown
    expect(StyleSheet.flatten(styleFor({ pressed: true }) as never)).toMatchObject({
      backgroundColor: darkPalette.surfaceStrong,
    })
    expect(StyleSheet.flatten(styleFor({ pressed: false }) as never)?.backgroundColor).toBe(darkPalette.canvas)
  })
})

describe('light layers keep the pre-hardening look', () => {
  it('overlay is the plain canvas, pressed is surfaceSoft, shimmer is canvas', () => {
    expect(lightTheme.custom.layers.overlay).toEqual({ backgroundColor: lightPalette.canvas })
    expect(lightTheme.custom.layers.pressed).toBe(lightPalette.surfaceSoft)
    expect(lightTheme.custom.layers.shimmer).toBe(lightPalette.canvas)
  })
})

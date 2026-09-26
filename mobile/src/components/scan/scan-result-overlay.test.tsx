import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { ScanResultOverlay, type ScanResult } from '@/components/scan/scan-result-overlay'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { ApiClientError } from '@/services/api-error'
import { describeFailure, QUEUE_FULL_FEEDBACK, QUEUED_FEEDBACK } from '@/utils/scan-feedback'

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }))

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light' },
}))

const mockNotification = jest.mocked(Haptics.notificationAsync)
const mockImpact = jest.mocked(Haptics.impactAsync)

const SUCCESS: ScanResult = {
  kind: 'success',
  title: 'Embarque confirmado',
  detail: 'Aluno registrado nesta viagem.',
  studentName: 'Ana Souza',
}

function failure(error: unknown, studentName?: string): ScanResult {
  return { kind: 'failure', ...describeFailure(error), studentName }
}

const DUPLICATE = failure(new ApiClientError('DUPLICATE_CHECK_IN', '', 409), 'Ana Souza')
const NOT_ALLOWED = failure(new ApiClientError('STUDENT_NOT_ALLOWED', '', 403))
const NETWORK = failure(new TypeError('offline'))
const TRIP_NOT_ACTIVE = failure(new ApiClientError('TRIP_NOT_ACTIVE', '', 409))
const QUEUED: ScanResult = { kind: 'failure', ...QUEUED_FEEDBACK }
const QUEUE_FULL: ScanResult = { kind: 'failure', ...QUEUE_FULL_FEEDBACK }

async function renderOverlay(result: ScanResult) {
  const onResume = jest.fn()
  const onRetry = jest.fn()
  await renderUi(
    <ScanResultOverlay result={result} onResume={onResume} onRetry={onRetry} autoResumeMs={2500} />,
  )
  return { onResume, onRetry }
}

function iconName(): string | undefined {
  return screen
    .getByTestId('scan-overlay-message', { includeHiddenElements: true })
    .findAll((node: TestNode) => typeof node.props.name === 'string')[0]?.props.name
}

function styleOf(node: TestNode) {
  return StyleSheet.flatten(node.props.style)
}

const originalOS = Platform.OS

beforeEach(() => jest.clearAllMocks())

afterEach(() => {
  Platform.OS = originalOS
  jest.mocked(Reanimated.useReducedMotion).mockReturnValue(false)
})

describe('ScanResultOverlay', () => {
  it('renders nothing while idle', async () => {
    await renderOverlay({ kind: 'idle' })
    expect(screen.queryByTestId('scan-overlay')).toBeNull()
  })

  it('checking: ink background with "Verificando..." and no haptic', async () => {
    await renderOverlay({ kind: 'checking' })
    expect(screen.getByText('Verificando...')).toBeTruthy()
    expect(styleOf(screen.getByTestId('scan-overlay')).backgroundColor).toBe(lightPalette.primary)
    expect(mockNotification).not.toHaveBeenCalled()
    expect(mockImpact).not.toHaveBeenCalled()
  })

  it('success: green, check-bold, title + student name + detail, Success haptic, announced by name', async () => {
    await renderOverlay(SUCCESS)
    expect(styleOf(screen.getByTestId('scan-overlay')).backgroundColor).toBe(lightPalette.success)
    expect(iconName()).toBe('check-bold')
    expect(screen.getByText('Embarque confirmado')).toBeTruthy()
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.getByText('Aluno registrado nesta viagem.')).toBeTruthy()
    expect(mockNotification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success)
    const message = screen.getByTestId('scan-overlay-message')
    expect(message.props.accessibilityLabel).toBe('Ana Souza embarcou')
    expect(message.props.accessibilityLiveRegion).toBe('assertive')
  })

  it('success without a known student: no name line, announces the title', async () => {
    await renderOverlay({ ...SUCCESS, studentName: undefined })
    expect(screen.queryByText('Ana Souza')).toBeNull()
    expect(screen.getByTestId('scan-overlay-message').props.accessibilityLabel).toBe('Embarque confirmado')
  })

  it('success: 4dp countdown bar and a tap anywhere resumes', async () => {
    const { onResume } = await renderOverlay(SUCCESS)
    expect(styleOf(screen.getByTestId('scan-overlay-countdown')).height).toBe(4)
    fireEvent.press(screen.getByTestId('scan-overlay-dismiss'))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('success: "Escanear próximo" is the on-color action and resumes', async () => {
    const { onResume } = await renderOverlay(SUCCESS)
    fireEvent.press(screen.getByRole('button', { name: 'Escanear próximo' }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('queued: offline tone, cloud-upload-outline, Light impact, countdown and tap to resume', async () => {
    const { onResume } = await renderOverlay(QUEUED)
    expect(styleOf(screen.getByTestId('scan-overlay')).backgroundColor).toBe(lightPalette.textBody)
    expect(iconName()).toBe('cloud-upload-outline')
    expect(mockImpact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light)
    expect(mockNotification).not.toHaveBeenCalled()
    expect(screen.getByTestId('scan-overlay-countdown')).toBeTruthy()
    fireEvent.press(screen.getByTestId('scan-overlay-dismiss'))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('already boarded: amber, alert, Warning haptic, big bold type, name shown, no auto-resume affordances', async () => {
    await renderOverlay(DUPLICATE)
    expect(styleOf(screen.getByTestId('scan-overlay')).backgroundColor).toBe(lightPalette.warning)
    expect(iconName()).toBe('alert')
    expect(mockNotification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning)
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(styleOf(screen.getByText('Já embarcou')).fontSize).toBeGreaterThanOrEqual(24)
    const detail = styleOf(screen.getByText('Este aluno já fez check-in nesta viagem.'))
    expect(detail.fontSize).toBeGreaterThanOrEqual(20)
    expect(detail.fontWeight).toBe('700')
    expect(screen.queryByTestId('scan-overlay-countdown')).toBeNull()
    expect(screen.queryByTestId('scan-overlay-dismiss')).toBeNull()
    expect(screen.getByTestId('scan-overlay-message').props.accessibilityLabel).toBe(
      'Já embarcou: Ana Souza. Este aluno já fez check-in nesta viagem.',
    )
  })

  it('a failure without a known student announces title and detail', async () => {
    await renderOverlay(NOT_ALLOWED)
    expect(screen.getByTestId('scan-overlay-message').props.accessibilityLabel).toBe(
      'Aluno não autorizado. Este aluno não está vinculado à rota desta viagem.',
    )
  })

  it.each([
    ['failure', NOT_ALLOWED],
    ['queue full', QUEUE_FULL],
  ])('%s: red, close-thick, Error haptic, no tap-to-resume', async (_name, result) => {
    await renderOverlay(result)
    expect(styleOf(screen.getByTestId('scan-overlay')).backgroundColor).toBe(lightPalette.error)
    expect(iconName()).toBe('close-thick')
    expect(mockNotification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error)
    expect(screen.queryByTestId('scan-overlay-dismiss')).toBeNull()
  })

  it('no connection: offline tone, cloud-off-outline, Error haptic, "Tentar novamente" retries', async () => {
    const { onRetry, onResume } = await renderOverlay(NETWORK)
    expect(styleOf(screen.getByTestId('scan-overlay')).backgroundColor).toBe(lightPalette.textBody)
    expect(iconName()).toBe('cloud-off-outline')
    expect(mockNotification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error)
    fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    fireEvent.press(screen.getByRole('button', { name: 'Escanear próximo' }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('trip not active: "Ir para Viagem" navigates to the trip tab', async () => {
    await renderOverlay(TRIP_NOT_ACTIVE)
    fireEvent.press(screen.getByRole('button', { name: 'Ir para Viagem' }))
    expect(router.navigate).toHaveBeenCalledWith('/(driver)/trip')
  })

  it.each([SUCCESS, DUPLICATE, NOT_ALLOWED, NETWORK, QUEUED])('never renders a text glyph as the icon', async (result) => {
    await renderOverlay(result)
    for (const glyph of ['✓', '✕', '!']) expect(screen.queryByText(glyph)).toBeNull()
  })

  it('fires the haptic once per result, not on re-render', async () => {
    // Bare `render`: `renderUi`'s providers would be dropped by `rerender`,
    // remounting the overlay instead of updating it.
    const element = (
      <ScanResultOverlay result={SUCCESS} onResume={jest.fn()} onRetry={jest.fn()} autoResumeMs={2500} />
    )
    render(element)
    await act(async () => {})
    screen.rerender(
      <ScanResultOverlay result={SUCCESS} onResume={jest.fn()} onRetry={jest.fn()} autoResumeMs={2500} />,
    )
    await act(async () => {})
    expect(mockNotification).toHaveBeenCalledTimes(1)
  })

  it('the haptic dedup survives the effect re-running for the same result', async () => {
    const overlay = () => (
      <ScanResultOverlay result={SUCCESS} onResume={jest.fn()} onRetry={jest.fn()} autoResumeMs={2500} />
    )
    render(overlay())
    await act(async () => {})
    // Flipping reduced motion re-runs the effect with the same result object.
    jest.mocked(Reanimated.useReducedMotion).mockReturnValue(true)
    screen.rerender(overlay())
    await act(async () => {})
    expect(mockNotification).toHaveBeenCalledTimes(1)
  })

  it('no haptic on web', async () => {
    Platform.OS = 'web'
    await renderOverlay(SUCCESS)
    expect(mockNotification).not.toHaveBeenCalled()
  })

  it('a failing haptic is swallowed', async () => {
    mockNotification.mockRejectedValueOnce(new Error('no vibrator'))
    await renderOverlay(SUCCESS)
    expect(screen.getByText('Embarque confirmado')).toBeTruthy()
  })
})
